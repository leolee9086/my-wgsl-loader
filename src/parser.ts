import { isBuiltinFunction } from './builtins';

export type ImportItem = { type: string; name: string; key: string };

export function parseImportList(importList: string): ImportItem[] {
    return importList.split(',').map(item => {
        const [type, name] = item.trim().split(/\s+/);
        return { type, name, key: `${type}_${name}` };
    });
}

export function extractStruct(content: string, structName: string): string {
    // This regex is basic and might fail with nested comments or complex definitions.
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
        // Basic check to avoid matching commented-out functions.
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
        // Simplified comment skipping, may not handle all edge cases.
        if (char === '/' && source[i+1] === '/') {
            i = source.indexOf('\n', i);
            if (i === -1) return source.length;
            continue;
        }
        if (char === '/' && source[i+1] === '*') {
            i = source.indexOf('*/', i + 2);
            if (i === -1) return source.length;
            continue;
        }

        if (char === '{') {
            if (!foundFirstBracket) {
                // Find the first opening brace that marks the function body
                const declaration = source.substring(startPos, i);
                if (declaration.includes(')')) {
                    foundFirstBracket = true;
                }
            }
            if(foundFirstBracket) {
                bracketCount++;
            }
        } else if (char === '}') {
            if(foundFirstBracket) {
                bracketCount--;
            }
        }
        if (foundFirstBracket && bracketCount === 0) {
            return i + 1;
        }
    }
    return -1;
}

export function isInCommentOrString(preContent: string): boolean {
    // This is a simplified check. A more robust implementation would use a proper tokenizer.
    const lastSingleLineComment = preContent.lastIndexOf('//');
    const lastMultiLineCommentStart = preContent.lastIndexOf('/*');
    const lastMultiLineCommentEnd = preContent.lastIndexOf('*/');
    
    if (lastSingleLineComment > -1 && preContent.indexOf('\n', lastSingleLineComment) === -1) {
        return true; // Inside a single-line comment that hasn't ended.
    }
    
    if (lastMultiLineCommentStart > lastMultiLineCommentEnd) {
        return true; // Inside a multi-line comment.
    }

    // This doesn't handle escaped quotes.
    const quoteCount = (preContent.match(/"/g) || []).length;
    if(quoteCount % 2 !== 0){
        return true; // Likely inside a string.
    }

    return false;
}

export function extractConstant(source: string, constantName: string): string | null {
    const constRegex = new RegExp(`(let|const|var)\\s+${constantName}\\s*:\\s*.*?=.*;`, 'g');
    const match = source.match(constRegex);
    return match ? match[0] : null;
}

export function getMatchRange(match: RegExpExecArray): [number, number] {
    return [match.index, match.index + match[0].length];
}

/**
 * Parses uniform bindings from WGSL code.
 * This is a placeholder for the actual implementation.
 * @param wgslCode The WGSL code to parse.
 * @returns An object containing uniform definitions.
 */
export function parseUniforms(wgslCode: string): Record<string, any> {
    // TODO: Implement uniform parsing based on toread/uniformParser.js
    console.log('Uniform parsing not yet implemented.');
    return {};
}

/**
 * Low-level WGSL parsing utilities, grouped for convenient namespace import.
 */
export const utils = {
    isInCommentOrString,
    findFunctionStart,
    findFunctionEnd,
    extractStruct,
    extractConstant,
    getMatchRange,
    parseImportList,
}; 