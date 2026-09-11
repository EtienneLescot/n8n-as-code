/**
 * Quote a path or argument for a shell we do not control.
 *
 * Nothing here is executed by us. The result is written into generated agent context and
 * into CLI hints, for a person or an agent to paste into whatever shell they have. On
 * Windows that is often `cmd.exe`, which does not strip POSIX single quotes: it hands them
 * to the program verbatim, so a single-quoted path fails the moment it contains a space.
 * Double quotes are understood by `cmd.exe`, PowerShell and bash alike, which makes them
 * the only portable choice there.
 *
 * POSIX keeps single quotes, which suppress every expansion. That branch is airtight.
 *
 * What this promises, and what it does not: it groups a value into a single argument. On
 * Windows it does not suppress expansion, and cannot. Measured on cmd.exe:
 *
 *     "C:\dir\%VAR%\b.js"   ->  %VAR% expands, with or without the quotes
 *     "C:\dir\!VAR!\b.js"   ->  expands too, when delayed expansion is on
 *
 * No escaping fixes that. `%%` is batch-file syntax a prompt takes literally, `^` is inert
 * inside quotes, and either would corrupt the same string under PowerShell and bash, where
 * `$` and a backtick expand instead. One string cannot be safe in three shells at once.
 *
 * So the rule for callers is to prefer a relative path in generated text wherever one will
 * do. `%`, `!`, `$` and a backtick are all legal in Windows filenames, and a value carrying
 * one reaches the program changed.
 *
 * `platform` is injectable so the Windows branch is testable from any host.
 */
export function quoteShellArg(value: string, platform: NodeJS.Platform = process.platform): string {
    return platform === 'win32'
        ? `"${value}"`
        : `'${value.replace(/'/g, `'\\''`)}'`;
}
