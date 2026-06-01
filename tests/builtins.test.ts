import { isBuiltinFunction } from '../src/builtins';

describe('isBuiltinFunction', () => {
    it('should return true for known built-in functions', () => {
        expect(isBuiltinFunction('sin')).toBe(true);
        expect(isBuiltinFunction('cos')).toBe(true);
        expect(isBuiltinFunction('textureSample')).toBe(true);
        expect(isBuiltinFunction('vec4')).toBe(true);
    });

    it('should return false for non-built-in functions', () => {
        expect(isBuiltinFunction('myCustomFunction')).toBe(false);
        expect(isBuiltinFunction('another_function')).toBe(false);
        expect(isBuiltinFunction('PI')).toBe(false);
    });

    it('should return false for empty or weird strings', () => {
        expect(isBuiltinFunction('')).toBe(false);
        expect(isBuiltinFunction(' ')).toBe(false);
        expect(isBuiltinFunction('sin ')).toBe(false);
    });
}); 