/**
 * Name generation utilities
 * 
 * Handles:
 * - Convert display names to valid TypeScript identifiers
 * - Handle name collisions (HttpRequest1, HttpRequest2, ...)
 * - Sanitize special characters
 */

import { PropertyNameContext } from '../types.js';

/**
 * Regular expression matching CJK/Hangul/Kana scripts for preservation during transliteration.
 * Uses Unicode script properties for broader coverage than explicit ranges.
 */
const CJK_SCRIPTS_REGEX = /\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}/u;

/**
 * Create a property name context for tracking used names
 */
export function createPropertyNameContext(): PropertyNameContext {
    return {
        usedNames: new Set<string>(),
        collisionCounter: new Map<string, number>()
    };
}

/**
 * Generate a valid TypeScript property name from a node display name
 * 
 * Rules:
 * - Remove emojis and special characters
 * - Convert to PascalCase
 * - Handle collisions with numeric suffix (HttpRequest1, HttpRequest2)
 * - Ensure valid JavaScript identifier
 * 
 * @example
 * "🕘 Schedule Trigger" → "ScheduleTrigger"
 * "HTTP Request" → "HttpRequest"
 * "HTTP Request" (2nd) → "HttpRequest1"
 * "⚙️ Configuration" → "Configuration"
 * "⚙️ Configuration" (2nd) → "Configuration1"
 */
export function generatePropertyName(
    displayName: string,
    context: PropertyNameContext
): string {
    // Step 1: Clean the name (remove emojis, special chars)
    let cleaned = cleanDisplayName(displayName ?? '');
    
    // Step 2: Convert to PascalCase
    let baseName = toPascalCase(cleaned);
    
    // Step 3: Ensure valid identifier
    baseName = ensureValidIdentifier(baseName);
    
    // Step 4: Handle collisions
    let finalName = baseName;
    
    if (context.usedNames.has(baseName)) {
        // Get or initialize counter for this base name
        const currentCount = context.collisionCounter.get(baseName) || 0;
        const nextCount = currentCount + 1;
        
        // Use numeric suffix (Agent → Agent1)
        finalName = `${baseName}${nextCount}`;
        
        context.collisionCounter.set(baseName, nextCount);
    }
    
    // Step 5: Register the final name
    context.usedNames.add(finalName);
    
    return finalName;
}

/**
 * Clean display name: strip everything that isn't useful for identifier generation.
 *
 * Strategy: whitelist approach – transliterate accented chars to ASCII first,
 * then replace anything that is NOT a letter (including CJK), digit, space,
 * hyphen or underscore with a space (so exotic separators like → | () become
 * word boundaries). CJK Unified Ideographs (U+4E00–U+9FFF) and common
 * extensions are preserved as valid JS identifier characters.
 */
function cleanDisplayName(displayName: string): string {
    return transliterate(displayName)
        // Keep Unicode letters, digits, spaces, hyphens, underscores
        .replace(/[^\p{Letter}\p{Number}\s\-_]/gu, ' ')
        // Normalize whitespace
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Convert string to PascalCase
 *
 * @example
 * "schedule trigger" → "ScheduleTrigger"
 * "HTTP Request" → "HttpRequest"
 * "split in batches" → "SplitInBatches"
 */
function toPascalCase(str: string): string {
    return str
        // Split on spaces, hyphens, underscores
        .split(/[\s\-_]+/)
        // Capitalize first letter of each word (skip for CJK characters)
        .map(word => {
            if (word.length === 0) return '';

            // If the word is entirely CJK scripts, return as-is (no case transformation)
            if (CJK_SCRIPTS_REGEX.test(word) && !/[a-zA-Z0-9]/.test(word)) {
                return word;
            }

            // Preserve acronyms (HTTP, AI, etc.)
            if (word === word.toUpperCase() && word.length > 1) {
                return word.charAt(0) + word.slice(1).toLowerCase();
            }

            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        })
        .join('');
}

/**
 * Transliterate accented/diacritic characters to their ASCII base equivalent.
 * CJK, Hangul, and Kana characters are preserved as-is (NFD decomposition
 * would break Korean Hangul syllables into Jamo components).
 *
 * @example
 * "Mémoire" → "Memoire"
 * "Ärger" → "Arger"
 * "naïve" → "naive"
 * "檢查是否到齊" → "檢查是否到齊"
 * "데이터" → "데이터"
 */
function transliterate(str: string): string {
    // Guard against null/undefined (can happen when workflow JSON has missing node names)
    if (!str) return '';
    // Process char-by-char: only NFD-decompose non-CJK characters
    // CJK/Hangul/Kana scripts are passed through untouched
    let result = '';
    for (const char of str) {
        if (CJK_SCRIPTS_REGEX.test(char)) {
            result += char;
        } else {
            result += char.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        }
    }
    return result;
}

/**
 * Ensure string is a valid JavaScript identifier
 *
 * - Must start with letter, $, or _
 * - Can contain letters, digits, $, _
 * - Cannot be a reserved word
 */
function ensureValidIdentifier(name: string): string {
    // Transliterate accented characters before stripping (é→e, à→a, ü→u, …)
    // Preserve CJK ideographs, Hangul, and Kana as valid JS identifier characters
    let cleaned = transliterate(name).replace(/[^\p{Letter}\p{Number}_$]/gu, '');

    // If starts with number, prefix with underscore
    if (/^\d/.test(cleaned)) {
        cleaned = '_' + cleaned;
    }

    // If empty, use default name
    if (cleaned.length === 0) {
        cleaned = 'Node';
    }

    // If reserved word, append underscore
    if (isReservedWord(cleaned)) {
        cleaned = cleaned + '_';
    }

    return cleaned;
}

/**
 * Check if string is a JavaScript reserved word
 */
function isReservedWord(name: string): boolean {
    const reserved = new Set([
        'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger',
        'default', 'delete', 'do', 'else', 'enum', 'export', 'extends',
        'false', 'finally', 'for', 'function', 'if', 'import', 'in',
        'instanceof', 'new', 'null', 'return', 'super', 'switch', 'this',
        'throw', 'true', 'try', 'typeof', 'var', 'void', 'while', 'with',
        'yield', 'let', 'static', 'implements', 'interface', 'package',
        'private', 'protected', 'public'
    ]);
    
    return reserved.has(name.toLowerCase());
}

/**
 * Generate a unique class name from workflow name
 * 
 * @example
 * "Job Application Assistant" → "JobApplicationAssistantWorkflow"
 * "My Workflow" → "MyWorkflow"   (not doubled — already ends with Workflow)
 * "Send Slack Message" → "SendSlackMessageWorkflow"
 */
export function generateClassName(workflowName: string): string {
    let baseName = toPascalCase(cleanDisplayName(workflowName ?? ''));
    
    // Ensure valid identifier (strip remaining non-alphanumerics, handle leading digits, etc.)
    baseName = ensureValidIdentifier(baseName);
    
    // Ensure ends with "Workflow" suffix
    if (!baseName.endsWith('Workflow')) {
        return `${baseName}Workflow`;
    }
    
    return baseName;
}
