/**
 * Code formatting utilities
 * 
 * Handles:
 * - Prettier integration
 * - Comment generation
 * - Code structure formatting
 */

import * as prettier from 'prettier';

/**
 * Format TypeScript code with Prettier
 */
export async function formatTypeScript(code: string): Promise<string> {
    try {
        return await prettier.format(code, {
            parser: 'typescript',
            singleQuote: true,
            trailingComma: 'es5',
            tabWidth: 4,
            printWidth: 120,
            semi: true,
            arrowParens: 'always',
        });
    } catch (error) {
        console.warn('Prettier formatting failed, returning unformatted code:', error);
        return code;
    }
}

/**
 * Generate section comment
 */
export function generateSectionComment(title: string, style: 'minimal' | 'verbose' = 'verbose'): string {
    if (style === 'minimal') {
        return `// ${title}`;
    }
    
    const separator = '='.repeat(69);
    return `// ${separator}\n// ${title}\n// ${separator}`;
}

/**
 * Generate inline comment
 */
export function generateInlineComment(text: string): string {
    return `// ${text}`;
}

/**
 * Indent code block
 */
export function indent(code: string, level: number = 1, spaces: number = 4): string {
    const indentation = ' '.repeat(level * spaces);
    return code
        .split('\n')
        .map(line => line.length > 0 ? indentation + line : line)
        .join('\n');
}

/**
 * Generate import statement
 */
export function generateImportStatement(items: string[], from: string): string {
    return `import { ${items.join(', ')} } from '${from}';`;
}

/**
 * Wrap object in braces with proper formatting
 */
export function formatObject(obj: Record<string, any>, inline: boolean = false): string {
    if (Object.keys(obj).length === 0) {
        return '{}';
    }
    
    if (inline && Object.keys(obj).length === 1) {
        const [key, value] = Object.entries(obj)[0];
        return `{ ${key}: ${JSON.stringify(value)} }`;
    }
    
    // Multi-line format
    const entries = Object.entries(obj).map(([key, value]) => {
        const formattedValue = JSON.stringify(value, null, 4)
            .split('\n')
            .map((line, i) => i === 0 ? line : '    ' + line)
            .join('\n');
        
        return `    ${key}: ${formattedValue}`;
    });
    
    return `{\n${entries.join(',\n')}\n}`;
}
