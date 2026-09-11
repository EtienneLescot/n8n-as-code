import { describe, expect, it } from 'vitest';
import { quoteShellArg } from '../../src/utils/shell.js';

// Written with an explicit BACKSLASH constant rather than source escapes. The escaping is
// what these tests are about, so a literal that a tool or an editor can quietly reshape
// would let the test agree with a broken implementation.
const BACKSLASH = String.fromCharCode(92);
const DOLLAR = String.fromCharCode(36);

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

    it('groups a Windows value without suppressing expansion, which no escaping can fix', () => {
        // Measured on cmd.exe: %VAR% expands inside double quotes, and !VAR! expands when
        // delayed expansion is on. The value passes through unchanged on purpose. %% is
        // batch-file syntax a prompt takes literally, ^ is inert inside quotes, and either
        // would corrupt the same string under PowerShell and bash. Callers avoid this by
        // preferring a relative path, not by escaping.
        const p = 'C:' + BACKSLASH + 'dir' + BACKSLASH + '%VAR%' + BACKSLASH + '!VAR!.js';

        expect(quoteShellArg(p, 'win32')).toBe('"' + p + '"');
    });

    it('does suppress expansion on POSIX, where single quotes can', () => {
        expect(quoteShellArg('/home/u/' + DOLLAR + 'VAR/e.js', 'linux')).toBe("'/home/u/" + DOLLAR + "VAR/e.js'");
    });
});
