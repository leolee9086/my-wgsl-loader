import {
    parseImportList,
    extractStruct,
    extractFunction,
    findFunctionStart,
    findFunctionEnd,
    isInCommentOrString,
    extractConstant,
    getMatchRange,
    parseWGSLUniformBindings,
} from '../src/parser';

describe('parseImportList', () => {
    it('should parse a single import', () => {
        expect(parseImportList('fn myFunc')).toEqual([
            { type: 'fn', name: 'myFunc', key: 'fn_myFunc' },
        ]);
    });

    it('should parse multiple imports', () => {
        expect(parseImportList('fn myFunc, struct MyStruct')).toEqual([
            { type: 'fn', name: 'myFunc', key: 'fn_myFunc' },
            { type: 'struct', name: 'MyStruct', key: 'struct_MyStruct' },
        ]);
    });

    it('should handle constants with type prefix', () => {
        expect(parseImportList('f32 PI, u32 MAX_COUNT')).toEqual([
            { type: 'f32', name: 'PI', key: 'f32_PI' },
            { type: 'u32', name: 'MAX_COUNT', key: 'u32_MAX_COUNT' },
        ]);
    });

    it('should handle empty string', () => {
        const result = parseImportList('');
        expect(result).toHaveLength(1);
        expect(result[0].type).toBe('');
        expect(result[0].key).toBeDefined();
    });

    it('should trim whitespace', () => {
        expect(parseImportList('  fn  myFunc ,  struct  S  ')).toEqual([
            { type: 'fn', name: 'myFunc', key: 'fn_myFunc' },
            { type: 'struct', name: 'S', key: 'struct_S' },
        ]);
    });
});

describe('extractStruct', () => {
    const wgsl = `
struct VertexInput {
    @location(0) position: vec3f,
    @location(1) normal: vec3f,
};

struct Uniforms {
    model: mat4x4f,
    view: mat4x4f,
};
`;

    it('should extract a struct definition', () => {
        const result = extractStruct(wgsl, 'Uniforms');
        expect(result).toContain('struct Uniforms');
        expect(result).toContain('model: mat4x4f');
        expect(result).toContain('view: mat4x4f');
    });

    it('should extract the first struct', () => {
        const result = extractStruct(wgsl, 'VertexInput');
        expect(result).toContain('struct VertexInput');
        expect(result).toContain('@location(0) position: vec3f');
    });

    it('should throw for missing struct', () => {
        expect(() => extractStruct(wgsl, 'NotFound')).toThrow();
    });
});

describe('extractFunction', () => {
    const wgsl = `
fn add(a: f32, b: f32) -> f32 {
    return a + b;
}

// commented: fn old() { }

fn main() {
    let x = add(1.0, 2.0);
}
`;

    it('should extract a simple function', () => {
        const result = extractFunction(wgsl, 'add');
        expect(result).toContain('fn add(a: f32, b: f32) -> f32 {');
        expect(result).toContain('return a + b;');
    });

    it('should extract function with full body', () => {
        const result = extractFunction(wgsl, 'main');
        expect(result).toContain('fn main()');
        expect(result).toContain('let x = add(1.0, 2.0);');
    });

    it('should throw for missing function', () => {
        expect(() => extractFunction(wgsl, 'missing')).toThrow();
    });
});

describe('findFunctionStart', () => {
    it('should find fn keyword position', () => {
        const source = 'fn test() {}';
        const pos = findFunctionStart(source, 'test');
        expect(pos).toBe(0);
    });

    it('should skip commented functions (single-line)', () => {
        const source = '// fn old() {}\nfn test() {}';
        const pos = findFunctionStart(source, 'test');
        expect(pos).toBe(source.indexOf('fn test'));
    });

    it('should skip commented functions (multi-line)', () => {
        const source = '/* fn old() {} */\nfn test() {}';
        const pos = findFunctionStart(source, 'test');
        expect(pos).toBe(source.indexOf('fn test'));
    });

    it('should skip if fn appears in a string', () => {
        const source = 'let desc = "fn helper() {}";\nfn real() {}';
        const pos = findFunctionStart(source, 'real');
        expect(pos).toBe(source.indexOf('fn real'));
    });

    it('should return -1 for missing function', () => {
        expect(findFunctionStart('nothing here', 'test')).toBe(-1);
    });
});

describe('findFunctionEnd', () => {
    it('should find end of simple function', () => {
        const source = 'fn test() { return 1; }';
        const start = findFunctionStart(source, 'test');
        const end = findFunctionEnd(source, start);
        expect(source.slice(start, end)).toBe('fn test() { return 1; }');
    });

    it('should handle nested braces', () => {
        const source = `fn outer() {
    if (true) {
        let x = 1;
    }
    return 0;
}`;
        const start = findFunctionStart(source, 'outer');
        const end = findFunctionEnd(source, start);
        expect(source.slice(start, end).trim()).toContain('return 0;');
    });

    it('should skip single-line comments', () => {
        const source = `fn test() {
    // { this is not a brace
    return 1;
}`;
        const start = findFunctionStart(source, 'test');
        const end = findFunctionEnd(source, start);
        const body = source.slice(start, end);
        expect(body).toContain('return 1;');
        expect(end).toBeGreaterThan(start);
    });

    it('should skip multi-line comments', () => {
        const source = `fn test() {
    /* { } */
    return 1;
}`;
        const start = findFunctionStart(source, 'test');
        const end = findFunctionEnd(source, start);
        const body = source.slice(start, end);
        expect(body).toContain('return 1;');
    });
});

describe('isInCommentOrString', () => {
    it('should return false for clean code', () => {
        expect(isInCommentOrString('fn test()')).toBe(false);
    });

    it('should return true inside single-line comment', () => {
        expect(isInCommentOrString('// this is a comment\nbefore //')).toBe(true);
    });

    it('should return true inside multi-line comment', () => {
        expect(isInCommentOrString('/* start of comment')).toBe(true);
    });

    it('should return false after multi-line comment ends', () => {
        expect(isInCommentOrString('/* comment */ outside')).toBe(false);
    });

    it('should return true inside double-quoted string', () => {
        expect(isInCommentOrString('let s = "hello')).toBe(true);
    });

    it('should return false outside balanced quotes', () => {
        expect(isInCommentOrString('"hello" outside')).toBe(false);
    });
});

describe('extractConstant', () => {
    it('should extract a const declaration', () => {
        const source = 'const PI: f32 = 3.14159;';
        const result = extractConstant(source, 'PI');
        expect(result).toContain('PI');
        expect(result).toContain('3.14159');
    });

    it('should extract a let declaration', () => {
        const source = 'let maxCount: u32 = 100;';
        const result = extractConstant(source, 'maxCount');
        expect(result).toContain('maxCount');
        expect(result).toContain('100');
    });

    it('should extract a var declaration', () => {
        const source = 'var counter: i32 = 0;';
        const result = extractConstant(source, 'counter');
        expect(result).toContain('counter');
    });

    it('should return null for missing constant', () => {
        expect(extractConstant('nothing here', 'missing')).toBeNull();
    });
});

describe('getMatchRange', () => {
    it('should return start and end of a regex match', () => {
        const re = /test/g;
        const match = re.exec('xx test yy');
        const [start, end] = getMatchRange(match!);
        expect(start).toBe(3);
        expect(end).toBe(7);
    });
});

describe('parseWGSLUniformBindings', () => {
    it('should parse a simple uniform binding', () => {
        const wgsl = `
struct Camera {
    view: mat4x4f,
    proj: mat4x4f,
};

@group(0) @binding(0) var<uniform> camera: Camera;
`;
        const result = parseWGSLUniformBindings(wgsl);
        expect(result.camera).toBeDefined();
        expect(result.camera.group).toBe(0);
        expect(result.camera.binding).toBe(0);
        expect(result.camera.struct).toBe('Camera');
        expect(result.camera.fields.view.wgslType).toBe('mat4x4f');
        expect(result.camera.fields.proj.wgslType).toBe('mat4x4f');
    });

    it('should parse multiple bindings', () => {
        const wgsl = `
struct A { x: f32, };
struct B { y: vec3f, };

@group(0) @binding(0) var<uniform> a: A;
@group(1) @binding(2) var<uniform> b: B;
`;
        const result = parseWGSLUniformBindings(wgsl);
        expect(result.a.group).toBe(0);
        expect(result.b.group).toBe(1);
        expect(result.b.binding).toBe(2);
    });

    it('should handle array fields', () => {
        const wgsl = `
struct Data {
    values: array<f32>,
};

@group(0) @binding(0) var<uniform> data: Data;
`;
        const result = parseWGSLUniformBindings(wgsl);
        expect(result.data.fields.values.systemType).toBe('array_f32');
    });

    it('should convert WGSL types to system types', () => {
        const wgsl = `
struct Types {
    a: vec2f,
    b: vec3<f32>,
    c: mat4x4f,
};

@group(0) @binding(0) var<uniform> types: Types;
`;
        const result = parseWGSLUniformBindings(wgsl);
        expect(result.types.fields.a.systemType).toBe('vec2f');
        expect(result.types.fields.b.systemType).toBe('vec3f');
        expect(result.types.fields.c.systemType).toBe('mat4x4f');
    });

    it('should return empty for empty code', () => {
        expect(parseWGSLUniformBindings('')).toEqual({});
        expect(parseWGSLUniformBindings(null as any)).toEqual({});
    });

    it('should skip lines that are comment-bounded', () => {
        const wgsl = `
struct S { x: f32, };
@group(0) @binding(0) var<uniform> active: S;
`;
        const result = parseWGSLUniformBindings(wgsl);
        expect(result.active).toBeDefined();
    });
});
