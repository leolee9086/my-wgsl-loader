import {
    WGSL_IMPORT_REGEX,
    WGSL_EXPORT_REGEX,
    WGSL_FUNCTION_REGEX,
    WGSL_CONSTANT_REGEX,
    buildConstRegex,
    buildFnRegex,
} from '../src/regex';

describe('WGSL_IMPORT_REGEX', () => {
    it('should match #import with braces', () => {
        const source = '#import { fn myFunc } from "path/to/file.wgsl"';
        const match = source.match(WGSL_IMPORT_REGEX);
        expect(match).not.toBeNull();
        expect(match![0]).toBe(source);
    });

    it('should match @import syntax via the @import regex', () => {
        const source = '@import { struct S } from "./util.wgsl";';
        const ourImportRegex = /@import\s+{(.*?)}\s+from\s+['"](.*?)['"];/g;
        const match = source.match(ourImportRegex);
        expect(match).not.toBeNull();
    });

    it('should extract import list and path', () => {
        const source = '#import { fn a, fn b, struct C } from "https://example.com/shader.wgsl"';
        const match = WGSL_IMPORT_REGEX.exec(source);
        expect(match![1].trim()).toBe('fn a, fn b, struct C');
        expect(match![2]).toBe('https://example.com/shader.wgsl');
    });

    it('should match optional semicolon', () => {
        expect('#import { fn f } from "x.wgsl"').toMatch(WGSL_IMPORT_REGEX);
        expect('#import { fn f } from "x.wgsl";').toMatch(WGSL_IMPORT_REGEX);
    });
});

describe('WGSL_EXPORT_REGEX', () => {
    it('should match @export declarations', () => {
        const source = '@export fn myFunc';
        const match = source.match(WGSL_EXPORT_REGEX);
        expect(match).not.toBeNull();
        expect(match![0]).toBe('@export fn myFunc');
    });

    it('should match @export with trailing content', () => {
        const source = '@export const PI: f32 = 3.14;';
        const match = source.match(WGSL_EXPORT_REGEX);
        expect(match![0]).toBe('@export const PI: f32 = 3.14');
    });
});

describe('WGSL_FUNCTION_REGEX', () => {
    it('should extract function name from fn declaration', () => {
        const match = 'fn main() -> void'.match(WGSL_FUNCTION_REGEX);
        expect(match![1]).toBe('main');
    });

    it('should handle functions with type params', () => {
        const match = 'fn add(a: i32, b: i32) -> i32'.match(WGSL_FUNCTION_REGEX);
        expect(match![1]).toBe('add');
    });
});

describe('WGSL_CONSTANT_REGEX', () => {
    it('should match f32 constant', () => {
        const match = 'f32 PI'.match(WGSL_CONSTANT_REGEX);
        expect(match![1]).toBe('f32');
        expect(match![2]).toBe('PI');
    });

    it('should match u32 constant', () => {
        const match = 'u32 MAX_COUNT'.match(WGSL_CONSTANT_REGEX);
        expect(match![1]).toBe('u32');
        expect(match![2]).toBe('MAX_COUNT');
    });

    it('should match bool constant', () => {
        const match = 'bool ENABLED'.match(WGSL_CONSTANT_REGEX);
        expect(match![1]).toBe('bool');
        expect(match![2]).toBe('ENABLED');
    });
});

describe('buildConstRegex', () => {
    it('should build a regex for the given constant', () => {
        const regex = buildConstRegex('PI');
        expect('const PI: f32 = 3.14;').toMatch(regex);
    });

    it('should not match a different constant', () => {
        const regex = buildConstRegex('PI');
        expect('const TAU: f32 = 6.28;').not.toMatch(regex);
    });

    it('should handle @export prefix', () => {
        const regex = buildConstRegex('PI');
        expect('@export const PI: f32 = 3.14;').toMatch(regex);
    });
});

describe('buildFnRegex', () => {
    it('should build a regex for the given function', () => {
        const regex = buildFnRegex('main');
        expect('fn main() { return 1; }').toMatch(regex);
    });

    it('should not match a different function', () => {
        const regex = buildFnRegex('main');
        expect('fn helper() { return 0; }').not.toMatch(regex);
    });

    it('should handle @export prefix', () => {
        const regex = buildFnRegex('main');
        expect('@export fn main() { return 1; }').toMatch(regex);
    });
});
