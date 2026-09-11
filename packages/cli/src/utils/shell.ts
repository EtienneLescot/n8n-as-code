/**
 * Quote a path or argument for a shell we do not control.
 *
 * Nothing here is executed by us. The result is written into generated agent context
 * and into CLI hints, for a person or an agent to paste into whatever shell they have.
 * On Windows that is often `cmd.exe`, which does not strip POSIX single quotes: it hands
 * them to the program verbatim, so a single-quoted path fails the moment it contains a
 * space. Double quotes are understood by `cmd.exe`, PowerShell and bash alike, which
 * makes them the only portable choice there. Windows forbids `"` in a path, so nothing
 * needs escaping.
 *
 * POSIX keeps single quotes, which suppress every expansion; double quotes do not.
 *
 * Known ceiling: on Windows a value containing `$` or a backtick still expands under
 * PowerShell and bash. Both are legal in Windows filenames, and no escaping satisfies
 * cmd.exe, PowerShell and bash at once. Emit a relative path where you can.
 *
 * `platform` is injectable so the Windows branch is testable from any host.
 */
export function quoteShellArg(value: string, platform: NodeJS.Platform = process.platform): string {
    return platform === 'win32'
        ? `"${value}"`
        : `'${value.replace(/'/g, `'\\''`)}'`;
}
