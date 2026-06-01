/**
 * Checks if a given function name is a WGSL built-in function.
 * @param fnName - The name of the function to check.
 * @returns True if the function is a built-in, false otherwise.
 */
export function isBuiltinFunction(fnName: string): boolean {
    const builtins = new Set([
        // Math functions
        'abs', 'acos', 'acosh', 'asin', 'asinh', 'atan', 'atan2', 'atanh',
        'ceil', 'clamp', 'cos', 'cosh', 'cross', 'degrees',
        'distance', 'exp', 'exp2', 'floor', 'fma', 'fract',
        'inverseSqrt', 'length', 'log', 'log2',
        'max', 'min', 'mix', 'modf', 'pow',
        'radians', 'round', 'sign', 'sin', 'sinh',
        'smoothstep', 'sqrt', 'step', 'tan', 'tanh',
        'trunc', 'dot', 'normalize',

        // Vector and matrix operations
        'dot', 'cross', 'normalize', 'reflect', 'refract',
        'length', 'distance', 'faceForward', 'transpose', 'determinant',

        // Texture functions
        'textureSample', 'textureSampleLevel', 'textureSampleGrad',
        'textureSampleCompare', 'textureLoad', 'textureStore',
        'textureDimensions', 'textureNumLevels', 'textureNumLayers',
        'textureNumSamples',

        // Type conversion
        'bitcast', 'vec2', 'vec3', 'vec4',
        'mat2x2', 'mat2x3', 'mat2x4',
        'mat3x2', 'mat3x3', 'mat3x4',
        'mat4x2', 'mat4x3', 'mat4x4',

        // Integer math
        'countOneBits', 'reverseBits', 'firstLeadingBit', 'firstTrailingBit',
        'insertBits', 'extractBits',

        // Atomic operations
        'atomicLoad', 'atomicStore', 'atomicAdd', 'atomicSub',
        'atomicMin', 'atomicMax', 'atomicAnd', 'atomicOr', 'atomicXor',
        'atomicExchange', 'atomicCompareExchangeWeak',

        // Synchronization and memory barriers
        'storageBarrier', 'workgroupBarrier',

        // Workgroup and derivative functions
        'workgroupUniformLoad',
        'dpdx', 'dpdy', 'fwidth',
        'dpdxCoarse', 'dpdyCoarse', 'fwidthCoarse',
        'dpdxFine', 'dpdyFine', 'fwidthFine',

        // Array and buffer operations
        'arrayLength',

        // Packing and unpacking
        'pack2x16float', 'pack2x16snorm', 'pack2x16unorm',
        'pack4x8snorm', 'pack4x8unorm',
        'unpack2x16float', 'unpack2x16snorm', 'unpack2x16unorm',
        'unpack4x8snorm', 'unpack4x8unorm',

        // Other utility functions
        'select', 'all', 'any', 'saturate'
    ]);
    
    return builtins.has(fnName);
} 