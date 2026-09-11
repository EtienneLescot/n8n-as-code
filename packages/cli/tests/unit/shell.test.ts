import { describe, expect, it } from 'vitest';
import { quoteShellArg } from '../../src/utils/shell.js';

// Written with an explicit BACKSLASH constant rather than source escapes. The escaping is
// what these tests are about, so a literal that a tool or an editor can quietly reshape
// would let the test agree with a broken implementation.
const BACKSLASH = String.fromCharCode(92);

describe('quoteShellArg', () => {
    it('double-quotes on Windows, because cmd.exe does not strip single quotes', () => {
        // Measured: `node '<path with a space>'` fails under cmd.exe with MODULE_NOT_FOUND,
        // the quotes reaching node as part of the path. Double quotes work in cmd.exe,
        // PowerShell and bash alike.
        const p = 'C:' + BACKSLASH + 'dir with space' + BACKSLASH + 'e.js';

        expect(quoteShellArg(p, 'win32')).toBe('"' + p + '"');
    });

    it('single-quotes on POSIX, where they suppress every expansion', () => {
        expect(quoteShellArg('/home/u/my dir/e.js', 'linux')).toBe("'/home/u/my dir/e.js'");
    });

    it('closes, escapes and reopens around an embedded single quote on POSIX', () => {
        expect(quoteShellArg("/home/u/it's/e.js", 'darwin'))
            .toBe("'/home/u/it'" + BACKSLASH + "''s/e.js'");
    });

    it('quotes a plain value on both, so callers never concatenate bare', () => {
        expect(quoteShellArg('n8nac', 'win32')).toBe('"n8nac"');
        expect(quoteShellArg('n8nac', 'linux')).toBe("'n8nac'");
    });
});
