import { processConditionalCompilation } from '../src/preprocessor';

describe('processConditionalCompilation', () => {
    it('should keep content inside a true @ifdef block', () => {
        const source = '@ifdef DEBUG\nconst a = 1;\n@endif';
        const defines = { DEBUG: true };
        const result = processConditionalCompilation(source, defines);
        expect(result.trim()).toBe('const a = 1;');
    });

    it('should remove content inside a false @ifdef block', () => {
        const source = '@ifdef DEBUG\nconst a = 1;\n@endif';
        const defines = { DEBUG: false };
        const result = processConditionalCompilation(source, defines);
        expect(result.trim()).toBe('');
    });

    it('should keep content inside a true @ifndef block', () => {
        const source = '@ifndef RELEASE\nconst a = 1;\n@endif';
        const defines = { RELEASE: false };
        const result = processConditionalCompilation(source, defines);
        expect(result.trim()).toBe('const a = 1;');
    });

    it('should remove content inside a false @ifndef block', () => {
        const source = '@ifndef RELEASE\nconst a = 1;\n@endif';
        const defines = { RELEASE: true };
        const result = processConditionalCompilation(source, defines);
        expect(result.trim()).toBe('');
    });

    it('should handle @else block correctly when @ifdef is true', () => {
        const source = '@ifdef A\noption1\n@else\noption2\n@endif';
        const defines = { A: true };
        const result = processConditionalCompilation(source, defines);
        expect(result.trim()).toBe('option1');
    });

    it('should handle @else block correctly when @ifdef is false', () => {
        const source = '@ifdef A\noption1\n@else\noption2\n@endif';
        const defines = { A: false };
        const result = processConditionalCompilation(source, defines);
        expect(result.trim()).toBe('option2');
    });

    it('should handle nested directives correctly (true > true)', () => {
        const source = '@ifdef A\nlevel1\n@ifdef B\nlevel2\n@endif\n@endif';
        const defines = { A: true, B: true };
        const result = processConditionalCompilation(source, defines);
        expect(result.trim()).toBe('level1\nlevel2');
    });

    it('should handle nested directives correctly (true > false)', () => {
        const source = '@ifdef A\nlevel1\n@ifdef B\nlevel2\n@endif\n@endif';
        const defines = { A: true, B: false };
        const result = processConditionalCompilation(source, defines);
        expect(result.trim()).toBe('level1');
    });

    it('should handle nested directives correctly (false > true)', () => {
        const source = '@ifdef A\nlevel1\n@ifdef B\nlevel2\n@endif\n@endif';
        const defines = { A: false, B: true };
        const result = processConditionalCompilation(source, defines);
        expect(result.trim()).toBe('');
    });
    
    it('should throw an error for unmatched @endif', () => {
        const source = 'text\n@endif';
        expect(() => processConditionalCompilation(source, {})).toThrow();
    });

    it('should throw an error for unmatched @ifdef', () => {
        const source = '@ifdef A\ntext';
        expect(() => processConditionalCompilation(source, {})).toThrow();
    });
}); 