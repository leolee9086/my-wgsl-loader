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

export interface LocationInfo {
    location: number;
    type: string;
}

export interface OverrideInfo {
    name: string;
    type: string;
    id?: number;
    hasDefault: boolean;
}

export interface BindingInfo {
    group: number;
    binding: number;
    varName: string;
    resourceType: string; // "uniform", "storage", "read-only-storage", "sampler", "texture", "storage_texture", "external_texture"
    format?: string;
    access?: string;
    viewDimension?: string;
    sampleType?: string;
}

/** Extract @location(N) type mappings from a WGSL struct or function parameter list. */
export function parseLocations(wgsl: string, sourceSlice?: string): LocationInfo[] {
    const source = sourceSlice ?? wgsl;
    const locations: LocationInfo[] = [];
    const locRegex = /@location\((\d+)\)\s+\w+\s*:\s*([^,{]+)/g;
    let match;
    while ((match = locRegex.exec(source)) !== null) {
        locations.push({ location: parseInt(match[1]), type: match[2].trim() });
    }
    return locations;
}

/**
 * Parse override declarations from WGSL source.
 * Matches patterns like:
 *   override x: f32 = 1.0;
 *   override y: f32;
 *   @id(1) override z: f32;
 */
export function parseOverrides(wgsl: string): OverrideInfo[] {
    const overrides: OverrideInfo[] = [];
    const overrideRegex = /(?:@id\((\d+)\)\s+)?override\s+(\w+)\s*:\s*(\w+)(?:\s*=\s*([^;]+))?;/g;
    let match;
    while ((match = overrideRegex.exec(wgsl)) !== null) {
        overrides.push({
            id: match[1] ? parseInt(match[1]) : undefined,
            name: match[2],
            type: match[3],
            hasDefault: match[4] !== undefined,
        });
    }
    return overrides;
}

/**
 * Parse all binding declarations from WGSL source.
 * Matches: @group(N) @binding(M) var<type> name: <resource_type>;
 * Where resource_type can be:
 *   - buffer types: BufferType, array<f32>, etc. (for var<uniform>, var<storage>)
 *   - sampler: sampler, sampler_comparison
 *   - texture: texture_1d/2d/3d/cube<format, access>
 *   - storage_texture: texture_storage_1d/2d/3d<format, access>
 *   - external_texture: texture_external
 */
export function parseBindings(wgsl: string): BindingInfo[] {
    const bindings: BindingInfo[] = [];
    const bindingRegex = /@group\((\d+)\)\s+@binding\((\d+)\)\s+var\s*(?:<(\w+)>)?\s*(\w+)\s*:\s*([^;]+);/g;
    let match;
    while ((match = bindingRegex.exec(wgsl)) !== null) {
        const group = parseInt(match[1]);
        const binding = parseInt(match[2]);
        const addressSpace = match[3] ?? ""; // uniform, storage, read_write, etc.
        const varName = match[4];
        const typeDecl = match[5].trim();

        let resourceType = "unknown";
        let format: string | undefined;
        let access: string | undefined;
        let viewDimension: string | undefined;
        let sampleType: string | undefined;

        if (typeDecl.startsWith("texture_storage_")) {
            resourceType = "storage_texture";
            // texture_storage_1d<rgba8unorm, write>
            const storageMatch = typeDecl.match(/texture_storage_(\w+)<(\w+),\s*(\w+)>/);
            if (storageMatch) {
                viewDimension = storageMatch[1];
                format = storageMatch[2];
                access = storageMatch[3];
            }
        } else if (typeDecl.startsWith("texture_external")) {
            resourceType = "external_texture";
        } else if (typeDecl.startsWith("texture_depth") || typeDecl.startsWith("texture_multisampled")) {
            resourceType = "texture";
            // texture_depth_2d, texture_depth_2d_array, texture_multisampled_2d
            const texMatch = typeDecl.match(/texture_(?:depth|multisampled)_(\w+)(?:\s*<\s*([^>]+)\s*>)?/);
            if (texMatch) {
                viewDimension = texMatch[1];
                sampleType = "depth";
            }
        } else if (typeDecl.startsWith("texture_")) {
            resourceType = "texture";
            // texture_1d<f32>, texture_2d<rgba8unorm>, etc.
            const texMatch = typeDecl.match(/texture_(\w+)<([^>]+)>/);
            if (texMatch) {
                viewDimension = texMatch[1];
                sampleType = texMatch[2];
            }
        } else if (typeDecl === "sampler") {
            resourceType = "sampler";
        } else if (typeDecl === "sampler_comparison") {
            resourceType = "sampler";
        } else {
            // Buffer type
            resourceType = addressSpace === "uniform" ? "uniform" :
                          addressSpace === "storage" ? "storage" :
                          addressSpace === "read_write" ? "storage" :
                          addressSpace === "function" ? "uniform" :
                          "uniform";
        }

        bindings.push({
            group, binding, varName, resourceType,
            format, access, viewDimension, sampleType,
        });
    }
    return bindings;
}

/**
 * Extract storage texture format+access info (specific helper for CTS storage_texture tests).
 */
export function parseStorageTextureInfo(wgsl: string): Array<{ format: string; access: string; dimension: string }> {
    const result: Array<{ format: string; access: string; dimension: string }> = [];
    const storageRegex = /texture_storage_(\w+)<(\w+),\s*(\w+)>/g;
    let match;
    while ((match = storageRegex.exec(wgsl)) !== null) {
        result.push({ dimension: match[1], format: match[2], access: match[3] });
    }
    return result;
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
    parseLocations,
    parseOverrides,
    parseBindings,
    parseStorageTextureInfo,
}; 