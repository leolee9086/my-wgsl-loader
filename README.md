# WGSL Module Loader

A powerful preprocessor and module loader for WGSL (WebGPU Shading Language).

This tool brings modern module capabilities to WGSL, allowing you to organize your shader code into smaller, reusable files. It supports features like `@import`, dependency resolution, conditional compilation (`@ifdef`/`@ifndef`), and macros (`@define`).

## Features

- **`@import`:** Import functions and structs from other WGSL files.
  ```wgsl
  @import { some_function, MyStruct } from './utils.wgsl';
  ```
- **Dependency Resolution:** Automatically resolves the correct order for imported functions and their dependencies using topological sorting.
- **Conditional Compilation:** Use `@ifdef`, `@ifndef`, `@else`, and `@endif` to include or exclude parts of your shader based on defined flags.
- **Macros:** Define simple constants or code snippets with `@define`.
- **Cross-Environment:** Works in both Node.js (for build pipelines) and the browser.

## Installation

```bash
npm install wgsl-module-loader
```

## Usage

```typescript
import { WGSLModuleLoader } from 'wgsl-module-loader';

const loader = new WGSLModuleLoader({
  defines: {
    USE_HIGH_QUALITY: true
  }
});

async function main() {
  const shaderCode = await loader.load('./main.wgsl');
  console.log(shaderCode);
  // Now you can use the processed shaderCode to create a WebGPU pipeline.
}

main();
```

## Build

To build the project from source:

```bash
npm install
npm run build
``` 