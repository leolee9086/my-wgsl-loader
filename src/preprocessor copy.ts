import MagicString from 'magic-string';

export function processMacros(source: string, macros: Record<string, string> = {}): string {
    let result = source;
    for (const macroName in macros) {
        if (macros.hasOwnProperty(macroName)) {
            result = expandMacro(result, macroName, macros[macroName]);
        }
    }
    return result;
}

export function expandMacro(source: string, macroName: string, macro: string): string {
    const regex = new RegExp(`@define\\s+${macroName}\\s+(.*)`, 'g');
    source = source.replace(regex, ''); // remove definition
    return source.replace(new RegExp(macroName, 'g'), macro);
}

export function processConditionalCompilation(source: string, defines: Record<string, boolean | undefined>): string {
    const s = new MagicString(source);
    const stack: { condition: boolean; hasBeenMet: boolean; start: number }[] = [];
    const directiveRegex = /@(ifdef|ifndef|else|endif)\b(?:\s+(\w+))?/g;
    
    let match;
    let lastIndex = 0;

    while ((match = directiveRegex.exec(source)) !== null) {
        const [fullMatch, directive, variable] = match;
        const directiveStart = match.index;
        const directiveEnd = directiveStart + fullMatch.length;

        // Remove content between directives based on the current stack state
        const shouldRemoveContent = stack.length > 0 && !stack[stack.length - 1].condition;
        if (shouldRemoveContent) {
            s.remove(lastIndex, directiveStart);
        }

        s.remove(directiveStart, directiveEnd); // Always remove the directive itself

        const top = stack.length > 0 ? stack[stack.length - 1] : null;

        switch (directive) {
            case 'ifdef':
                const isDefined = defines[variable!] === true;
                stack.push({ condition: isDefined, hasBeenMet: isDefined, start: directiveEnd });
                break;
            case 'ifndef':
                const isNotDefined = defines[variable!] !== true;
                stack.push({ condition: isNotDefined, hasBeenMet: isNotDefined, start: directiveEnd });
                break;
            case 'else':
                if (top === null) {
                    throw new Error(`@else without matching @ifdef/@ifndef at index ${directiveStart}`);
                }
                if (top.hasBeenMet) {
                    top.condition = false; // If the `if` part was met, `else` part should be false
                } else {
                    top.condition = true; // If the `if` part was not met, `else` part is now active
                }
                break;
            case 'endif':
                if (top === null) {
                    throw new Error(`@endif without matching @ifdef/@ifndef at index ${directiveStart}`);
                }
                stack.pop();
                break;
        }
        
        lastIndex = directiveEnd;
    }

    if (stack.length > 0) {
        throw new Error(`Unmatched @ifdef/@ifndef directive(s)`);
    }

    // Remove any remaining code if the last block was inside a false condition
    if (lastIndex < source.length) {
         const shouldRemoveContent = stack.length > 0 && !stack[stack.length - 1].condition;
         if (shouldRemoveContent) {
             s.remove(lastIndex, source.length);
         }
    }

    return s.toString().replace(/^\s*\n/gm, ''); // Remove blank lines left by directives
} 