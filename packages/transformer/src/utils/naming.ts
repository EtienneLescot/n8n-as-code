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
    let cleaned = cleanDisplayName(displayName);
    
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
 * Clean display name: remove emojis, trim, normalize spaces
 */
function cleanDisplayName(displayName: string): string {
    return displayName
        // Remove emojis (Unicode emoji ranges)
        .replace(/[\u{1F300}-\u{1F9FF}]/gu, '')
        // Remove other special Unicode symbols
        .replace(/[\u{2600}-\u{26FF}]/gu, '')
        .replace(/[\u{2700}-\u{27BF}]/gu, '')
        // Remove colons (common separator after emojis)
        .replace(/^[\s:]+/, '')
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
        // Capitalize first letter of each word
        .map(word => {
            if (word.length === 0) return '';
            
            // Preserve acronyms (HTTP, AI, etc.)
            if (word === word.toUpperCase() && word.length > 1) {
                return word.charAt(0) + word.slice(1).toLowerCase();
            }
            
            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        })
        .join('');
}

/**
 * Ensure string is a valid JavaScript identifier
 * 
 * - Must start with letter, $, or _
 * - Can contain letters, digits, $, _
 * - Cannot be a reserved word
 */
function ensureValidIdentifier(name: string): string {
    // Remove invalid characters
    let cleaned = name.replace(/[^a-zA-Z0-9_$]/g, '');
    
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
 * "My Workflow" → "MyWorkflowWorkflow"
 */
export function generateClassName(workflowName: string): string {
    const baseName = toPascalCase(cleanDisplayName(workflowName));
    
    // Ensure ends with "Workflow" suffix
    if (!baseName.endsWith('Workflow')) {
        return `${baseName}Workflow`;
    }
    
    return baseName;
}
