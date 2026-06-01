import MagicString from '../../../../static/magic-string.mjs';
import { isBuiltinFunction } from './wgsl/isBuiltinFunction.js';
import * as wglsRegs from './wgsl/regex.js';
import { parseWGSLUniformBindings } from './wgsl/uniformParser.js';

// 纯函数：解析导入列表
function parseImportList(importList) {
    return importList.split(',').map(item => {
        const [type, name] = item.trim().split(/\s+/);
        return { type, name, key: `${type}_${name}` };
    });
}

// 纯函数：处理单个导入声明
function processImportDeclaration(content, importItems, declarations) {
    const functionMap = new Map();
    const structMap = new Map();
    const dependencyGraph = new Map();
    
    // 提取结构体定义
    function extractStruct(structName) {
        const structRegex = new RegExp(`struct\\s+${structName}\\s*{[^}]*}`, 'g');
        const match = content.match(structRegex);
        if (!match) {
            throw new Error(`Struct ${structName} not found in imported content`);
        }
        return match[0];
    }
    
    // 递归查找函数及其所有依赖
    function findFunctionAndDependencies(fnName, visited = new Set()) {
        if (functionMap.has(fnName)) return;
        if (visited.has(fnName)) return;
        visited.add(fnName);
        
        try {
            const fnContent = extractFunction(content, fnName);
            functionMap.set(fnName, fnContent);
            
            // 查找所有函数调用和结构体使用
            const fnCallRegex = /\b(\w+)\s*\(/g;
            const structUseRegex = /\b(struct\s+\w+|[A-Z]\w*)\b/g;
            const directDeps = new Set();
            let match;
            
            // 查找函数调用
            while ((match = fnCallRegex.exec(fnContent)) !== null) {
                const calledFn = match[1];
                if (!isBuiltinFunction(calledFn) && calledFn !== fnName) {
                    directDeps.add(calledFn);
                    findFunctionAndDependencies(calledFn, visited);
                }
            }
            
            // 查找结构体使用
            while ((match = structUseRegex.exec(fnContent)) !== null) {
                const structName = match[1].replace('struct ', '');
                if (!structMap.has(structName)) {
                    try {
                        const structDef = extractStruct(structName);
                        structMap.set(structName, structDef);
                    } catch (e) {
                        // 忽略内置类型或找不到的结构体
                    }
                }
            }
            
            dependencyGraph.set(fnName, directDeps);
        } catch (e) {
            dependencyGraph.set(fnName, new Set());
        }
    }
    
    // 处理所有导入项
    for (const { type, name, key } of importItems) {
        if (!declarations.has(key)) {
            switch (type) {
                case 'fn':
                    findFunctionAndDependencies(name);
                    break;
                case 'struct':
                    try {
                        const structDef = extractStruct(name);
                        structMap.set(name, structDef);
                        declarations.add(key);
                    } catch (e) {
                        console.warn(`Failed to extract struct ${name}: ${e.message}`);
                    }
                    break;
                case 'f32':
                case 'i32':
                case 'u32':
                    try {
                        const constDef = extractConstant(content, name);
                        if (constDef) {
                            declarations.add(key);
                            functionMap.set(name, constDef);
                        }
                    } catch (e) {
                        console.warn(`Failed to extract constant ${name}: ${e.message}`);
                    }
                    break;
            }
        }
    }
    
    // 拓扑排序
    const orderedFunctions = [];
    const visited = new Set();
    const processing = new Set();
    
    function visit(fnName) {
        if (processing.has(fnName)) return;
        if (visited.has(fnName)) return;
        
        processing.add(fnName);
        
        const deps = dependencyGraph.get(fnName) || new Set();
        for (const dep of deps) {
            visit(dep);
        }
        
        processing.delete(fnName);
        visited.add(fnName);
        
        if (functionMap.has(fnName)) {
            orderedFunctions.push(fnName);
        }
    }
    
    // 从每个导入函数开始排序
    for (const { type, name } of importItems) {
        if (type === 'fn') {
            visit(name);
        }
    }
    
    // 生成最终代码
    const processedContent = [];
    
    // 首先添加所有结构体定义
    for (const structDef of structMap.values()) {
        processedContent.push(structDef);
    }
    
    // 然后添加函数定义
    for (const fnName of orderedFunctions) {
        const fnContent = functionMap.get(fnName);
        if (fnContent) {
            processedContent.push(fnContent);
            declarations.add(`fn_${fnName}`);
        }
    }
    
    return processedContent.join('\n\n');
}

// 拓扑排序实现
function topologicalSort(graph) {
    const result = [];
    const visited = new Set();
    const temp = new Set();
    
    function visit(node) {
        if (temp.has(node)) {
            // 检测到循环依赖，但继续处理
            return;
        }
        if (visited.has(node)) {
            return;
        }
        
        temp.add(node);
        
        // 访问所有依赖
        const deps = graph.get(node) || new Set();
        for (const dep of deps) {
            visit(dep);
        }
        
        temp.delete(node);
        visited.add(node);
        result.push(node);
    }
    
    // 处理所有节点
    for (const node of graph.keys()) {
        if (!visited.has(node)) {
            visit(node);
        }
    }
    
    return result;
}

// 简化版的函数提取
function extractFunction(source, functionName) {
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

// 纯函数：处理导入内容的缓存
async function processImportCache(absolutePath, content, basePath, importCache) {
    if (!importCache.has(absolutePath)) {
        const processedContent = await processImports(content, basePath, importCache);
        importCache.set(absolutePath, processedContent);
    }
    return importCache.get(absolutePath);
}
function resolveImportPath(basePath, importPath) {
    if (importPath.startsWith('http://') || importPath.startsWith('https://')) {
        return importPath;
    }
    if (basePath.startsWith('http://') || basePath.startsWith('https://')) {
        const baseUrl = new URL(basePath);
        return new URL(importPath, baseUrl).toString();
    }
    return path.resolve(basePath, importPath);
}


function findFunctionStart(source, fnName) {
    const fnStartRegex = new RegExp(`\\bfn\\s+${fnName}\\s*\\(`, 'g');
    let match;
    while ((match = fnStartRegex.exec(source)) !== null) {
        // 检查是否是注释或字符串
        const preContent = source.substring(0, match.index);
        if (!isInCommentOrString(preContent)) {
            return match.index;
        }
    }
    return -1;
}

function findFunctionEnd(source, startPos) {
    let bracketCount = 0;
    let foundFirstBracket = false;
    
    for (let i = startPos; i < source.length; i++) {
        const char = source[i];
        
        if (char === '/' && source[i + 1] === '/') {
            // Skip single-line comment
            i = source.indexOf('\n', i);
            if (i === -1) i = source.length; // End of file
            continue;
        } else if (char === '/' && source[i + 1] === '*') {
            // Skip multi-line comment
            i = source.indexOf('*/', i + 2) + 1;
            if (i === 0) i = source.length; // End of file, comment not closed
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

function isInCommentOrString(preContent) {
    // Basic check (can be improved for complex cases)
    const lastSingleLineComment = preContent.lastIndexOf('//');
    const lastMultiLineCommentStart = preContent.lastIndexOf('/*');
    const lastMultiLineCommentEnd = preContent.lastIndexOf('*/');
    
    if (lastSingleLineComment > lastMultiLineCommentStart && lastSingleLineComment > lastMultiLineCommentEnd) {
        if (preContent.indexOf('\n', lastSingleLineComment) === -1) {
            return true; // Inside single-line comment
        }
    }
    
    if (lastMultiLineCommentStart > lastSingleLineComment && lastMultiLineCommentStart > lastMultiLineCommentEnd) {
        return true; // Inside multi-line comment
    }
    
    // Very basic string check (doesn't handle escaped quotes)
    const quoteCount = (preContent.match(/"/g) || []).length;
    if (quoteCount % 2 !== 0) {
        return true; // Likely inside a string
    }
    
    return false;
}


function extractConstant(source, constantName) {
    const constRegex = new RegExp(`(?:let|const|var)\\s+${constantName}\\s*:\\s*\w+\\s*=\s*[^;]+;`, 'g');
    const match = source.match(constRegex);
    return match ? match[0] : null;
}


async function fetchContent(path) {
    if (path.startsWith('http://') || path.startsWith('https://')) {
        const response = await fetch(path);
        if (!response.ok) {
            throw new Error(`Failed to fetch WGSL module from ${path}: ${response.statusText}`);
        }
        return await response.text();
    } else {
        return fs.promises.readFile(path, 'utf-8');
    }
}

function processMacros(source, macros = {}) {
    let processed = source;
    // 提取宏定义
    const defineRegex = /@define\s+(\w+)\s+(.+)/g;
    let match;
    while ((match = defineRegex.exec(processed)) !== null) {
        macros[match[1]] = match[2];
    }
    processed = processed.replace(defineRegex, ''); // 移除定义

    // 展开宏调用
    for (const name in macros) {
        const regex = new RegExp(`\\b${name}\\b`, 'g');
        processed = processed.replace(regex, macros[name]);
    }
    return { processed, macros };
}

function expandMacro(source, macroName, macro) {
    // 简化版本，只做简单替换
    // 实际需要解析参数等，更复杂
    const macroCallRegex = new RegExp(`\\b${macroName}\\s*\\(([^)]*)\\)`, 'g');
    return source.replace(macroCallRegex, (match, args) => {
        const argValues = args.split(',').map(a => a.trim());
        let expanded = macro.body;
        macro.params.forEach((param, index) => {
            const regex = new RegExp(`\\b${param}\\b`, 'g');
            expanded = expanded.replace(regex, argValues[index] || '');
        });
        return expanded;
    });
}

async function processWGSL(source, filePath, importCache = new Map(), macros = {}) {
    const basePath = path.dirname(filePath);
    let s = new MagicString(source);
    let hasChanged = false;

    // 1. 处理宏
    const macroResult = processMacros(source, macros);
    if (macroResult.processed !== source) {
        s = new MagicString(macroResult.processed);
        macros = macroResult.macros;
        hasChanged = true;
    }

    // 2. 处理导入
    const importResult = await processImports(s.toString(), basePath, importCache);
    if (importResult.processedContent !== s.toString()) {
        s = new MagicString(importResult.processedContent);
        hasChanged = true;
    }

    // 3. 后处理（例如移除空行）
    const finalCode = postProcess(s.toString());

    return { code: finalCode, imports: importResult.allImports, macros };
}

async function processImports(source, basePath, importCache) {
    const s = new MagicString(source);
    const importRegex = /@import\s+\{([^}]+)\}\s+from\s+["']([^"']+)["'];?/g;
    const allImports = new Set();
    const declarations = new Set();
    let match;
    let offset = 0;

    while ((match = importRegex.exec(source)) !== null) {
        const importListStr = match[1];
        const importPath = match[2];
        const absolutePath = resolveImportPath(basePath, importPath);
        allImports.add(absolutePath);

        const importItems = parseImportList(importListStr);
        
        try {
            const importedContent = await fetchContent(absolutePath);
            const processedImported = await processImportCache(absolutePath, importedContent, path.dirname(absolutePath), importCache);
            
            const injectedCode = processImportDeclaration(processedImported.code, importItems, declarations);
            
            const start = match.index + offset;
            const end = start + match[0].length;
            
            s.overwrite(start, end, injectedCode);
            offset += injectedCode.length - match[0].length;
            
        } catch (e) {
            console.error(`Failed to process import from ${importPath}: ${e.message}`);
            // 选择是抛出错误还是跳过导入
            // s.remove(start, end); // 移除失败的导入
            // offset -= match[0].length;
             throw e; // 或者重新抛出错误
        }
    }
    
    return { processedContent: s.toString(), allImports };
}

function postProcess(source) {
    // 移除多余的空行
    return source.replace(/\n\s*\n/g, '\n\n').trim();
}

function getMatchRange(match) {
    return { start: match.index, end: match.index + match[0].length };
}


function processConditionalCompilation(source, defines = {}) {
    const s = new MagicString(source);
    const stack = []; // 存储每个条件块的状态 { conditionMet, inElse } 
    let offset = 0;

    const directiveRegex = /@(ifdef|ifndef|else|endif)\b(?:\s+(\w+))?/g;
    let match;

    while ((match = directiveRegex.exec(source)) !== null) {
        const [fullMatch, directive, conditionVar] = match;
        const { start, end } = getMatchRange(match);
        
        if (directive === 'ifdef' || directive === 'ifndef') {
            const conditionMet = evaluateCondition(conditionVar, defines) === (directive === 'ifdef');
            stack.push({ conditionMet, inElse: false });
        } else if (directive === 'else') {
            if (stack.length === 0) throw new Error("@else without matching @ifdef/@ifndef");
            stack[stack.length - 1].inElse = true;
        } else if (directive === 'endif') {
            if (stack.length === 0) throw new Error("@endif without matching @ifdef/@ifndef");
            stack.pop();
        }

        // 根据当前的条件栈决定是否移除代码
        let shouldRemove = false;
        if (stack.length > 0) {
            const currentCondition = stack[stack.length - 1];
            if (currentCondition.inElse) {
                shouldRemove = currentCondition.conditionMet; // 在 else 块中，如果条件为真则移除
            } else {
                shouldRemove = !currentCondition.conditionMet; // 在 if/ifndef 块中，如果条件为假则移除
            }
        }

        // 标记移除指令本身
        s.remove(start + offset, end + offset);
        // 这部分逻辑需要调整，不能简单地移除指令和之后的内容，需要找到匹配的 endif
        // 需要更复杂的逻辑来跟踪块的范围并移除
    }

    if (stack.length > 0) {
        throw new Error("Unmatched @ifdef/@ifndef directive(s)");
    }

    // 这是一个简化的实现，需要完善块移除逻辑
    return s.toString(); 
}

function evaluateCondition(condition, defines) {
    if (!condition) return false; // @ifdef/ifndef 后面必须有变量
    return defines.hasOwnProperty(condition);
}

/**
 * 加载并处理WGSL代码文件，支持 @import, @define, @ifdef 等预处理指令。
 *
 * @param {string} filePath - WGSL文件的路径或URL。
 * @param {object} [options={}] - 处理选项。
 * @param {boolean} [options.cache=true] - 是否缓存已处理的导入文件。
 * @param {object} [options.defines={}] - 用于条件编译的定义对象。
 * @param {Map<string, {code: string, imports: Set<string>}>} [options.importCache=new Map()] - 外部导入缓存。
 * @param {object} [options.macros={}] - 外部宏定义。
 * @returns {Promise<string>} 处理后的WGSL代码字符串。
 * @throws {Error} 如果文件读取、获取或处理失败。
 *
 * @example
 * // 基本用法
 * const code = await requireWGSLCode('./shaders/main.wgsl');
 *
 * // 带选项
 * const code = await requireWGSLCode('./shaders/main.wgsl', {
 *   defines: { USE_FOG: true },
 *   macros: { MAX_LIGHTS: '4' }
 * });
 */
export async function requireWGSLCode(filePath, options = { 
    cache: true, 
    defines: {},
    importCache: new Map(),
    macros: {}
}) {
    const finalOptions = {
        cache: true,
        defines: {},
        importCache: new Map(),
        macros: {},
        ...options
    };

    try {
        const absolutePath = resolveImportPath('', filePath); // 获取绝对路径用于缓存键
        const cacheKey = absolutePath + JSON.stringify(finalOptions.defines) + JSON.stringify(finalOptions.macros);
        
        if (finalOptions.cache && finalOptions.importCache.has(cacheKey)) {
            return finalOptions.importCache.get(cacheKey).code;
        }

        const rawSource = await fetchContent(absolutePath);
        
        // 1. 处理条件编译
        const conditionallyCompiled = processConditionalCompilation(rawSource, finalOptions.defines);
        
        // 2. 处理宏（需要先于导入处理，宏可能影响导入内容）
        const { processed: macroProcessed, macros: definedMacros } = processMacros(conditionallyCompiled, finalOptions.macros);
        
        // 合并外部和内部定义的宏
        const allMacros = { ...finalOptions.macros, ...definedMacros }; 
        
        // 3. 处理导入（传入所有宏）
        // 注意：这里的processWGSL内部调用了processImports等
        // 需要将宏信息传递下去，或在processImports中重新处理宏（当前实现是在processWGSL开始时处理）
        const { code: processedCode, imports } = await processWGSL(
            macroProcessed, 
            absolutePath, 
            finalOptions.importCache, 
            allMacros // 将所有宏传递下去
        );
        
        const result = { code: processedCode, imports };
        
        if (finalOptions.cache) {
            finalOptions.importCache.set(cacheKey, result);
        }
        
        return result.code;
    } catch (error) {
        console.error(`Error processing WGSL file ${filePath}:`, error);
        throw error;
    }
}


/**
 * 实验性的 WGSL 模块加载器类
 */
export class WGSLModuleLoader {
    constructor(options = {}) {
        this.cache = new Map();
        this.dependencyGraph = new Map();
        this.options = {
            cache: true,
            defines: {},
            macros: {},
            ...options
        };
    }

    async _load_(path, options = {}) {
        const finalOptions = { ...this.options, ...options };
        const code = await requireWGSLCode(path, finalOptions);
        // 这里可以添加更多处理，比如解析uniforms等
        const uniforms = parseWGSLUniformBindings(code);
        const module = { code, uniforms, path };
        this.cache.set(path, module);
        return module;
    }

    get(path) {
        return this.cache.get(path);
    }

    async require(modulePath, currentModulePath = '') {
        const absolutePath = resolveImportPath(path.dirname(currentModulePath), modulePath);
        if (this.cache.has(absolutePath)) {
            return this.cache.get(absolutePath);
        }
        return await this._load_(absolutePath);
    }

    async export(name, modulePath) {
        // 实现导出逻辑，可能涉及别名等
        const module = await this.require(modulePath);
        // ... 更复杂的导出处理 ...
        return module; // 简化返回
    }

    async compile(entryPointPath) {
        // 编译单个模块（可能包括其依赖）
        const entryModule = await this._load_(entryPointPath);
        // 这里可以添加编译步骤，例如使用 Naga 或 Tint
        console.log(`Compiled: ${entryPointPath}`);
        return entryModule.code; // 返回处理后的代码
    }

    async link(...modulePaths) {
        // 链接多个模块
        const loadedModules = await Promise.all(modulePaths.map(p => this._load_(p)));
        // 实现链接逻辑，合并代码，处理命名冲突等
        const linkedCode = loadedModules.map(m => `// Module: ${m.path}\n${m.code}`).join('\n\n');
        console.log(`Linked modules: ${modulePaths.join(', ')}`);
        return linkedCode;
    }
}

// Helper function to resolve paths relative to the current file if running in Node
const path = typeof require === 'function' ? require('path') : {
    resolve: (base, p) => new URL(p, base).pathname, 
    dirname: (p) => p.substring(0, p.lastIndexOf('/'))
};

const fs = typeof require === 'function' ? require('fs') : {
    promises: {
        readFile: async (p, enc) => { throw new Error('fs.promises.readFile not available in this environment'); }
    }
}; 