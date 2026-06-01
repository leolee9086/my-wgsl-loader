import { isBuiltinFunction } from './builtins';

export type ImportItem = { type: string; name: string; key: string };

export function parseImportList(importList: string): ImportItem[] {
    return importList.split(',').map(item => {
        const [type, name] = item.trim().split(/\s+/);
        return { type, name, key: `${type}_${name}` };
    });
}

export function extractStruct(content: string, structName: string): string {
    const structRegex = new RegExp(`struct\\s+${structName}\\s*{[^}]*}`, 'g');
    const match = content.match(structRegex);
    if (!match) {
        throw new Error(`Struct ${structName} not found in imported content`);
    }
    return match[0];
}

export function extractFunction(source: string, functionName: string): string {
    const fnDefStart = findFunctionStart(source, functionName);
    if (fnDefStart === -1) {
        throw new Error(`Function ${functionName} not found in imported content`);
    }
    const fnDefEnd = findFunctionEnd(source, fnDefStart);
    if (fnDefEnd === -1) {
        throw new Error(`Incomplete function definition for ${functionName}`);
    }
    return source.substring(fnDefStart, fnDefEnd).trim();
}

export function findFunctionStart(source: string, fnName: string): number {
    const fnStartRegex = new RegExp(`\\bfn\\s+${fnName}\\s*\\(`, 'g');
    let match;
    while ((match = fnStartRegex.exec(source)) !== null) {
        const preContent = source.substring(0, match.index);
        if (!isInCommentOrString(preContent)) {
            return match.index;
        }
    }
    return -1;
}

export function findFunctionEnd(source: string, startPos: number): number {
    let bracketCount = 0;
    let foundFirstBracket = false;

    for (let i = startPos; i < source.length; i++) {
        const char = source[i];

        if (char === '/' && source[i + 1] === '/') {
            i = source.indexOf('\n', i);
            if (i === -1) i = source.length;
            continue;
        } else if (char === '/' && source[i + 1] === '*') {
            i = source.indexOf('*/', i + 2) + 1;
            if (i === 0) i = source.length;
            continue;
        } else if (char === '{') {
            foundFirstBracket = true;
            bracketCount++;
        } else if (char === '}') {
            bracketCount--;
            if (foundFirstBracket && bracketCount === 0) {
                return i + 1;
            }
        }
    }
    return -1;
}

export function isInCommentOrString(preContent: string): boolean {
    const lastSingleLineComment = preContent.lastIndexOf('//');
    const lastMultiLineCommentStart = preContent.lastIndexOf('/*');
    const lastMultiLineCommentEnd = preContent.lastIndexOf('*/');

    if (lastSingleLineComment > lastMultiLineCommentStart && lastSingleLineComment > lastMultiLineCommentEnd) {
        if (preContent.indexOf('\n', lastSingleLineComment) === -1) {
            return true;
        }
    }

    if (lastMultiLineCommentStart > lastSingleLineComment && lastMultiLineCommentStart > lastMultiLineCommentEnd) {
        return true;
    }

    const quoteCount = (preContent.match(/"/g) || []).length;
    if (quoteCount % 2 !== 0) {
        return true;
    }

    return false;
}

export function extractConstant(source: string, constantName: string): string | null {
    const constRegex = new RegExp(`(?:let|const|var)\\s+${constantName}\\s*:\\s*\\w+\\s*=\\s*[^;]+;`, 'g');
    const match = source.match(constRegex);
    return match ? match[0] : null;
}

export function getMatchRange(match: RegExpExecArray): [number, number] {
    return [match.index, match.index + match[0].length];
}

type UniformField = {
    name: string;
    wgslType: string;
    systemType: string;
};

type UniformDef = {
    group: number;
    binding: number;
    struct: string;
    fields: Record<string, UniformField>;
};

function convertWGSLType(wgslType: string): string {
    const typeMap: Record<string, string> = {
        'f32': 'f32',
        'i32': 'i32',
        'u32': 'u32',
        'vec2f': 'vec2f',
        'vec2<f32>': 'vec2f',
        'vec3f': 'vec3f',
        'vec3<f32>': 'vec3f',
        'vec4f': 'vec4f',
        'vec4<f32>': 'vec4f',
        'mat2x2f': 'mat2x2f',
        'mat2x2<f32>': 'mat2x2f',
        'mat3x3f': 'mat3x3f',
        'mat3x3<f32>': 'mat3x3f',
        'mat4x4f': 'mat4x4f',
        'mat4x4<f32>': 'mat4x4f',
        'array<f32>': 'array_f32',
    };

    const arrayMatch = wgslType.match(/array<(.+)>/);
    if (arrayMatch) {
        const baseType = convertWGSLType(arrayMatch[1]);
        return `array_${baseType}`;
    }

    return typeMap[wgslType] || 'unknown';
}

function removeComments(line: string): string {
    return line.replace(/\/\*.*?\*\//g, '').split('//')[0];
}

export function parseWGSLUniformBindings(wgslCode: string): Record<string, UniformDef> {
    if (!wgslCode || typeof wgslCode !== 'string') {
        return {};
    }

    const uniforms: Record<string, UniformDef> = {};
    const uniformRegex = /@group\((\d+)\)\s+@binding\((\d+)\)\s+var<uniform>\s+(\w+)\s*:\s*(\w+)/g;
    const matches = [...wgslCode.matchAll(uniformRegex)];

    for (const match of matches) {
        const [, group, binding, varName, structName] = match;

        const structDef = extractStruct(wgslCode, structName);
        if (structDef) {
            uniforms[varName] = {
                group: parseInt(group),
                binding: parseInt(binding),
                struct: structName,
                fields: parseStructFields(structDef),
            };
        }
    }

    return uniforms;
}

function parseStructFields(structDef: string): Record<string, UniformField> {
    const fields: Record<string, UniformField> = {};
    const lines = structDef.split(/\r?\n/);

    for (const line of lines) {
        const codeLine = removeComments(line).trim();
        if (!codeLine) continue;

        const match = codeLine.match(/(\w+)\s*:\s*([\w\d_<>\[\]]+)/);
        if (!match) continue;

        const [, name, wgslType] = match;
        fields[name] = {
            name,
            wgslType,
            systemType: convertWGSLType(wgslType),
        };
    }

    return fields;
}

export interface EntryPointInfo {
    name: string;
    stage: "vertex" | "fragment" | "compute";
}

/**
 * Parse entry points from WGSL source code.
 * Uses a stateful O(n) scanner that correctly handles comments,
 * strings, and Unicode identifiers.
 */
export function parseEntryPoints(wgsl: string): EntryPointInfo[] {
    const entries: EntryPointInfo[] = [];
    const len = wgsl.length;

    const isIdentStart = (c: string) => /[a-zA-Z_]/.test(c) || (c.codePointAt(0) ?? 0) > 0x7f;
    const isIdentCont = (c: string) => isIdentStart(c) || /[0-9]/.test(c);

    let i = 0;
    let pendingAttr: string | null = null;

    const peek = (n = 0) => (i + n < len ? wgsl[i + n] : "");

    while (i < len) {
        const c = wgsl[i];

        // Line comment
        if (c === "/" && peek(1) === "/") {
            while (i < len && wgsl[i] !== "\n") i++;
            continue;
        }

        // Block comment
        if (c === "/" && peek(1) === "*") {
            i += 2;
            while (i < len - 1 && !(wgsl[i] === "*" && peek(1) === "/")) i++;
            i += 2;
            continue;
        }

        // String literals
        if (c === '"' || c === "'") {
            const quote = c;
            i++;
            while (i < len && wgsl[i] !== quote) {
                if (wgsl[i] === "\\") i++;
                i++;
            }
            if (i < len) i++;
            continue;
        }

        // Attribute: @identifier — only track stage attributes
        if (c === "@") {
            i++;
            let attr = "";
            while (i < len && isIdentCont(wgsl[i])) {
                attr += wgsl[i];
                i++;
            }
            if (attr === "vertex" || attr === "fragment" || attr === "compute") {
                pendingAttr = attr;
            }
            continue;
        }

        // fn keyword
        if (c === "f" && peek(1) === "n" && !isIdentCont(peek(2))) {
            i += 2;
            while (i < len && /[\s]/.test(wgsl[i])) i++;
            let name = "";
            if (i < len && isIdentStart(wgsl[i])) {
                while (i < len && isIdentCont(wgsl[i])) {
                    name += wgsl[i];
                    i++;
                }
            }
            if (name && pendingAttr) {
                if (!entries.some(e => e.name === name && e.stage === pendingAttr)) {
                    entries.push({ name, stage: pendingAttr as EntryPointInfo["stage"] });
                }
            }
            pendingAttr = null;
            continue;
        }

        i++;
    }

    return entries;
}

/**
 * Detect the immediate data size (in bytes) used by a WGSL shader.
 * Looks for `var<immediate> data: <StructName>;` and then finds the
 * struct definition using extractStruct.
 *
 * Example:
 *   struct Immediates { m0: u32, m1: u32, m2: u32, m3: u32 }
 *   var<immediate> data: Immediates;
 *   → returns 16 (4 fields × 4 bytes)
 */
export function detectImmediateSize(wgsl: string): number {
    if (!wgsl.includes("immediate")) return 0;

    const varMatch = wgsl.match(/var<immediate>\s+\w+\s*:\s*(\w+)\s*;/);
    if (!varMatch) return 0;

    const structName = varMatch[1];

    try {
        const structDef = extractStruct(wgsl, structName);
        const fieldRegex = /(\w+)\s*:\s*\w+/g;
        const fields = structDef.match(fieldRegex);
        return (fields?.length ?? 0) * 4;
    } catch {
        return 0;
    }
}

export const utils = {
    isInCommentOrString,
    findFunctionStart,
    findFunctionEnd,
    extractStruct,
    extractConstant,
    getMatchRange,
    parseImportList,
    parseEntryPoints,
    detectImmediateSize,
}; 