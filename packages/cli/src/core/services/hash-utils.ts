import crypto from 'crypto';
import stringify from 'json-stable-stringify';

/**
 * Hash Utilities for canonical hashing
 * 
 * Provides consistent SHA-256 hashing of JSON content with stable stringification.
 * Used by all components to ensure hash consistency.
 */
export class HashUtils {
    /**
     * Computes a stable, canonical hash for any object (usually a workflow).
     * Non-functional metadata should be removed before calling this.
     */
    static computeHash(content: any): string {
        const canonicalString = stringify(content) || '';
        return crypto.createHash('sha256').update(canonicalString).digest('hex');
    }

    /**
     * Compares two objects by computing their canonical hashes
     */
    static areEqual(obj1: any, obj2: any): boolean {
        return this.computeHash(obj1) === this.computeHash(obj2);
    }

    /**
     * Short hash for display purposes
     */
    static shortHash(hash: string, length: number = 8): string {
        return hash.substring(0, length);
    }
}