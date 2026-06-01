import MagicString from 'magic-string';
import {
    parseImportList,
    extractStruct,
    extractFunction,
    extractConstant,
    getMatchRange,
    parseWGSLUniformBindings,
} from './parser';
import { isBuiltinFunction } from './builtins';
import { processMacros, processConditionalCompilation } from './preprocessor';
import { fetchContent, resolveImportPath } from './utils';
import path from 'path';

type ImportItem = { type: string; name: string; key: string };

function findFunctionAndDependencies(
    content: string,
    fnName: string,
    functionMap: Map<string, string>,
    structMap: Map<string, string>,
    dependencyGraph: Map<string, Set<string>>,
    visited: Set<string> = new Set(),
) {
    if (functionMap.has(fnName) || visited.has(fnName)) return;
    visited.add(fnName);

    try {
        const fnContent = extractFunction(content, fnName);
        functionMap.set(fnName, fnContent);
        const directDeps = new Set<string>();

        const fnCallRegex = /\b(\w+)\s*\(/g;
        const structUseRegex = /\b(struct\s+\w+|[A-Z]\w*)\b/g;
        let match;

        while ((match = fnCallRegex.exec(fnContent)) !== null) {
            const calledFn = match[1];
            if (!isBuiltinFunction(calledFn) && calledFn !== fnName) {
                directDeps.add(calledFn);
                findFunctionAndDependencies(content, calledFn, functionMap, structMap, dependencyGraph, visited);
            }
        }

        while ((match = structUseRegex.exec(fnContent)) !== null) {
            const structName = match[1].replace('struct ', '');
            if (!structMap.has(structName)) {
                try {
                    const structDef = extractStruct(content, structName);
                    structMap.set(structName, structDef);
                } catch {
                    // ignore built-in types or unresolvable struct
                }
            }
        }

        dependencyGraph.set(fnName, directDeps);
    } catch {
        dependencyGraph.set(fnName, new Set());
    }
}

function processImportDeclaration(content: string, importItems: ImportItem[], declarations: Set<string>): string {
    const functionMap = new Map<string, string>();
    const structMap = new Map<string, string>();
    const dependencyGraph = new Map<string, Set<string>>();

    for (const { type, name, key } of importItems) {
        if (declarations.has(key)) continue;

        switch (type) {
            case 'fn':
                findFunctionAndDependencies(content, name, functionMap, structMap, dependencyGraph);
                break;
            case 'struct':
                try {
                    const structDef = extractStruct(content, name);
                    structMap.set(name, structDef);
                    declarations.add(key);
                } catch (e) {
                    console.warn(`Could not extract struct ${name}: ${(e as Error).message}`);
                }
                break;
            case 'f32':
            case 'i32':
            case 'u32': {
                const constDef = extractConstant(content, name);
                if (constDef) {
                    declarations.add(key);
                    functionMap.set(name, constDef);
                }
                break;
            }
        }
    }

    const orderedFunctions: string[] = [];
    const visited = new Set<string>();
    const temp = new Set<string>();

    function visit(fnName: string) {
        if (temp.has(fnName)) return;
        if (visited.has(fnName)) return;

        temp.add(fnName);
        const deps = dependencyGraph.get(fnName) || new Set();
        deps.forEach(dep => visit(dep));
        temp.delete(fnName);

        visited.add(fnName);
        if (functionMap.has(fnName)) {
            orderedFunctions.push(fnName);
        }
    }

    for (const { type, name } of importItems) {
        if (type === 'fn') visit(name);
    }

    const finalContent: string[] = [];
    structMap.forEach(structDef => finalContent.push(structDef));
    orderedFunctions.forEach(fnName => {
        finalContent.push(functionMap.get(fnName)!);
        declarations.add(`fn_${fnName}`);
    });

    return finalContent.join('\n\n');
}

async function processImports(
    source: string,
    basePath: string,
    importCache: Map<string, string>,
    declarations: Set<string> = new Set(),
): Promise<string> {
    const s = new MagicString(source);
    const importRegex = /@import\s+{(.*?)}\s+from\s+['"](.*?)['"];/g;
    let match;

    while ((match = importRegex.exec(source)) !== null) {
        const importList = match[1];
        const importPath = match[2];
        const importItems = parseImportList(importList);

        const absolutePath = resolveImportPath(basePath, importPath);

        let content: string;
        if (importCache.has(absolutePath)) {
            content = importCache.get(absolutePath)!;
        } else {
            content = await fetchContent(absolutePath);
            const processedContent = await processImports(content, absolutePath, importCache);
            importCache.set(absolutePath, processedContent);
            content = processedContent;
        }

        const injectedCode = processImportDeclaration(content, importItems, declarations);
        const [start, end] = getMatchRange(match);
        s.overwrite(start, end, injectedCode);
    }

    return s.toString();
}

export interface WGSLProcessOptions {
    cache?: boolean;
    defines?: Record<string, boolean>;
    macros?: Record<string, string>;
    importCache?: Map<string, string>;
}

export async function processWGSL(
    source: string,
    filePath: string,
    options: WGSLProcessOptions = {},
): Promise<string> {
    const { defines = {}, macros = {}, importCache = new Map() } = options;

    let processedSource = processMacros(source, macros);
    processedSource = processConditionalCompilation(processedSource, defines);
    processedSource = await processImports(processedSource, filePath, importCache);

    return processedSource;
}

export type { ImportItem };

export { parseImportList, parseWGSLUniformBindings } from './parser';


export async function requireWGSLCode(
    filePath: string,
    options: WGSLProcessOptions & { importCache?: Map<string, { code: string; imports: Set<string> }> } = {},
): Promise<string> {
    const finalOptions = {
        cache: true,
        defines: {} as Record<string, boolean>,
        importCache: new Map<string, { code: string; imports: Set<string> }>(),
        macros: {},
        ...options,
    };

    const absolutePath = resolveImportPath('', filePath);
    const cacheKey = absolutePath + JSON.stringify(finalOptions.defines) + JSON.stringify(finalOptions.macros);

    if (finalOptions.cache && finalOptions.importCache.has(cacheKey)) {
        return finalOptions.importCache.get(cacheKey)!.code;
    }

    const rawSource = await fetchContent(absolutePath);

    const conditionallyCompiled = processConditionalCompilation(rawSource, finalOptions.defines);
    const macroProcessed = processMacros(conditionallyCompiled, finalOptions.macros);
    const code = await processWGSL(macroProcessed, absolutePath, finalOptions);

    const result = { code, imports: new Set<string>() };

    if (finalOptions.cache) {
        finalOptions.importCache.set(cacheKey, result);
    }

    return code;
}

export class WGSLModuleLoader {
    private importCache = new Map<string, string>();
    private defines: Record<string, boolean>;
    private macros: Record<string, string>;

    constructor(options: WGSLProcessOptions = {}) {
        this.defines = options.defines || {};
        this.macros = options.macros || {};
    }

    async load(filePath: string): Promise<string> {
        const source = await fetchContent(filePath);
        return processWGSL(source, filePath, {
            defines: this.defines,
            macros: this.macros,
            importCache: this.importCache,
        });
    }

    get(path: string): string | undefined {
        return this.importCache.get(path);
    }
}
