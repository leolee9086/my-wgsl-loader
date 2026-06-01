import MagicString from 'magic-string';
// fs, path, URL are used in utils, no need to import here anymore
// import { promises as fs } from 'fs';
// import path from 'path';
// import { URL } from 'url';
import { 
    parseImportList,
    extractStruct,
    extractFunction,
    extractConstant,
    getMatchRange
} from './parser';
import { isBuiltinFunction } from './builtins';
import { processMacros, processConditionalCompilation } from './preprocessor';
import { fetchContent, resolveImportPath } from './utils';

// This file will now orchestrate the entire process,
// delegating parsing, preprocessing, and utility tasks to their respective modules.

type ImportItem = { type: string; name: string; key: string };

async function processImports(source: string, basePath: string, importCache: Map<string, string>): Promise<string> {
    const s = new MagicString(source);
    const importRegex = /@import\s+{(.*?)}\s+from\s+['"](.*?)['"];/g;
    let match;
    const declarations = new Set<string>();

    while ((match = importRegex.exec(source)) !== null) {
        const importList = match[1];
        const importPath = match[2];
        const importItems = parseImportList(importList);

        const absolutePath = resolveImportPath(basePath, importPath);

        let content;
        if (importCache.has(absolutePath)) {
            content = importCache.get(absolutePath)!;
        } else {
            content = await fetchContent(absolutePath);
            // Recursively process imports in the new file
            const processedContent = await processImports(content, absolutePath, importCache);
            importCache.set(absolutePath, processedContent);
            content = processedContent;
        }
        
        const processedContent = processImportDeclaration(content, importItems, declarations);
        const [start, end] = getMatchRange(match);
        s.overwrite(start, end, processedContent);
    }

    return s.toString();
}

function processImportDeclaration(content: string, importItems: ImportItem[], declarations: Set<string>): string {
    const functionMap = new Map<string, string>();
    const structMap = new Map<string, string>();
    const dependencyGraph = new Map<string, Set<string>>();

    function findFunctionAndDependencies(fnName: string, visited: Set<string> = new Set()) {
        if (functionMap.has(fnName) || visited.has(fnName)) return;
        visited.add(fnName);

        try {
            const fnContent = extractFunction(content, fnName);
            functionMap.set(fnName, fnContent);
            const directDeps = new Set<string>();

            const fnCallRegex = /\b(\w+)\s*\(/g;
            let match;
            while ((match = fnCallRegex.exec(fnContent)) !== null) {
                const calledFn = match[1];
                if (!isBuiltinFunction(calledFn) && calledFn !== fnName) {
                    directDeps.add(calledFn);
                }
            }
            dependencyGraph.set(fnName, directDeps);
            directDeps.forEach(dep => findFunctionAndDependencies(dep, visited));
        } catch (e) {
            // function not found, maybe it is in another import
        }
    }
    
    importItems.forEach(({ type, name, key }) => {
        if (!declarations.has(key)) {
            if (type === 'fn') {
                findFunctionAndDependencies(name);
            } else if (type === 'struct') {
                try {
                    const structDef = extractStruct(content, name);
                    structMap.set(name, structDef);
                    declarations.add(key);
                } catch (e) {
                    console.warn(`Could not extract struct ${name}: ${(e as Error).message}`);
                }
            }
        }
    });

    const orderedFunctions: string[] = [];
    const visited = new Set<string>();
    const temp = new Set<string>();
    
    function visit(fnName: string) {
        if (temp.has(fnName)) return; // cycle detection
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

    importItems.forEach(({ type, name }) => {
        if (type === 'fn') visit(name);
    });

    const finalContent: string[] = [];
    structMap.forEach(structDef => finalContent.push(structDef));
    orderedFunctions.forEach(fnName => {
        finalContent.push(functionMap.get(fnName)!);
        declarations.add(`fn_${fnName}`);
    });
    
    return finalContent.join('\n\n');
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
    options: WGSLProcessOptions = {}
): Promise<string> {
    const { defines = {}, macros = {}, importCache = new Map() } = options;
    
    let processedSource = processMacros(source, macros);
    processedSource = processConditionalCompilation(processedSource, defines);
    processedSource = await processImports(processedSource, filePath, importCache);
    
    return processedSource;
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