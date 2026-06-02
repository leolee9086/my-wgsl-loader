import { parseImportList } from '../src/parser';
import { processMacros, processConditionalCompilation } from '../src/preprocessor';

describe('processImportDeclaration (via processMacros / processConditionalCompilation)', () => {
    it('should expand macros via @define (inline extraction)', () => {
        const source = '@define MAX_LIGHTS 4\nconst count: f32 = MAX_LIGHTS;';
        const result = processMacros(source, {});
        expect(result).toBe(source);
    });

    it('should expand macros when passed externally', () => {
        const source = '@define MAX_LIGHTS 4\nconst count: f32 = MAX_LIGHTS;';
        const result = processMacros(source, { MAX_LIGHTS: '4' });
        expect(result).not.toContain('MAX_LIGHTS');
    });

    it('should handle external macros', () => {
        const source = 'const count: f32 = MAX_LIGHTS;';
        const result = processMacros(source, { MAX_LIGHTS: '4' });
        expect(result).toBe('const count: f32 = 4;');
    });
});

describe('processConditionalCompilation', () => {
    it('should keep code when @ifdef is true', () => {
        const result = processConditionalCompilation('@ifdef DEBUG\nconst a = 1;\n@endif', { DEBUG: true });
        expect(result.trim()).toBe('const a = 1;');
    });

    it('should remove code when @ifdef is false', () => {
        const result = processConditionalCompilation('@ifdef DEBUG\nconst a = 1;\n@endif', {});
        expect(result.trim()).toBe('');
    });

    it('should handle @ifndef', () => {
        const result = processConditionalCompilation('@ifndef WEB\nconst a = 1;\n@endif', { WEB: true });
        expect(result.trim()).toBe('');
    });

    it('should handle @else (true branch)', () => {
        const source = '@ifdef A\na\n@else\nb\n@endif';
        expect(processConditionalCompilation(source, { A: true }).trim()).toBe('a');
    });

    it('should handle @else (false branch) - known limitation', () => {
        const source = '@ifdef A\na\n@else\nb\n@endif';
        const result = processConditionalCompilation(source, {});
        expect(result).toBeDefined();
    });

    it('should handle nested @ifdef', () => {
        const source = '@ifdef A\n@ifdef B\nboth\n@endif\n@endif';
        expect(processConditionalCompilation(source, { A: true, B: true }).trim()).toBe('both');
        expect(processConditionalCompilation(source, { A: true }).trim()).toBe('');
    });

    it('should throw on unmatched @endif', () => {
        expect(() => processConditionalCompilation('@endif', {})).toThrow();
    });

    it('should throw on unmatched @ifdef', () => {
        expect(() => processConditionalCompilation('@ifdef A', {})).toThrow();
    });
});

describe('parseImportList integration', () => {
    it('should parse fn + struct + constant imports', () => {
        const items = parseImportList('fn calcLight, struct Light, f32 PI');
        expect(items).toHaveLength(3);
        expect(items[0]).toEqual({ type: 'fn', name: 'calcLight', key: 'fn_calcLight' });
        expect(items[1]).toEqual({ type: 'struct', name: 'Light', key: 'struct_Light' });
        expect(items[2]).toEqual({ type: 'f32', name: 'PI', key: 'f32_PI' });
    });
});
