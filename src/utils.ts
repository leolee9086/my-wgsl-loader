/// <reference types="node" />

import { promises as fs } from 'fs';
import path from 'path';
import { URL } from 'url';

export async function fetchContent(filePath: string): Promise<string> {
    if (filePath.startsWith('http')) {
        // Use dynamic import for node-fetch to keep it as an optional dependency.
        const fetch = typeof window !== 'undefined' ? window.fetch : (await import('node-fetch')).default;
        const response = await fetch(filePath);
        if (!response.ok) {
            throw new Error(`Failed to fetch WGSL module from ${filePath}: ${response.statusText}`);
        }
        return await response.text();
    } else {
        // This part will only run in a Node.js environment.
        if (typeof window !== 'undefined') {
            throw new Error('File system access is not available in the browser.');
        }
        return fs.readFile(filePath, 'utf-8');
    }
}

export function resolveImportPath(basePath: string, importPath: string): string {
    if (importPath.startsWith('http://') || importPath.startsWith('https://')) {
        return importPath;
    }
    
    // Handling browser environment where basePath is a URL
    if (basePath.startsWith('http://') || basePath.startsWith('https://')) {
        return new URL(importPath, basePath).toString();
    }

    // Handling Node.js environment
    // The original file path is needed to resolve relative paths.
    // If the base path is a directory, resolve against it. If it's a file, get its directory.
    let baseDir = basePath;
    // A simple check if the path is a file or directory. This could be improved.
    if (basePath.includes('.')) { // simplistic check for a file extension
        baseDir = path.dirname(basePath);
    }
    
    return path.resolve(baseDir, importPath);
} 