import { resolveN8nacCommandRefs } from '../src/services/cli-command-resolver.js';
import { AiContextGenerator } from '../src/services/ai-context-generator.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

/** Written this way so the literal cannot be mangled by an editor or a shell heredoc. */
const BACKSLASH = String.fromCharCode(92);

/** A project root holding a locally installed n8nac, as `npm install n8nac` leaves it. */
function withLocalInstall(root: string): string {
    fs.mkdirSync(path.join(root, 'node_modules', 'n8nac', 'dist'), { recursive: true });
    fs.writeFileSync(path.join(root, 'node_modules', 'n8nac', 'dist', 'index.js'), '', 'utf8');
    return root;
}

describe('resolveN8nacCommandRefs', () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'n8nac-resolver-'));
    });

    afterEach(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    describe('local install', () => {
        test('names the locally installed entry point instead of paying npx startup', () => {
            const refs = resolveN8nacCommandRefs({ projectRoot: withLocalInstall(tempDir), env: {} });

            expect(refs.source).toBe('local-install');
            expect(refs.cliCmd).toBe('node node_modules/n8nac/dist/index.js');
            expect(refs.skillsCmd).toBe('node node_modules/n8nac/dist/index.js skills');
        });

        test('falls back to the published npx form when nothing is installed locally', () => {
            const refs = resolveN8nacCommandRefs({ projectRoot: tempDir, distTag: 'next', env: {} });

            expect(refs.source).toBe('published');
            expect(refs.cliCmd).toBe('npx --yes n8nac@next');
        });

        test('ignores a local install when no project root is given', () => {
            // The packaged skill mirrors are pre-rendered with no project root and diff-gated in
            // CI. If this guard ever goes, the build bakes a machine-specific path into them.
            const cwd = process.cwd();
            try {
                process.chdir(withLocalInstall(tempDir));
                const refs = resolveN8nacCommandRefs({ env: {} });

                expect(refs.source).toBe('published');
                expect(refs.cliCmd).toBe('npx --yes n8nac');
            } finally {
                process.chdir(cwd);
            }
        });

        test('emits a relative, unquoted path so it survives cmd.exe and a committed AGENTS.md', () => {
            const refs = resolveN8nacCommandRefs({ projectRoot: withLocalInstall(tempDir), env: {} });

            expect(refs.cliCmd).not.toContain(tempDir);
            expect(refs.cliCmd).not.toMatch(/['"]/);
            expect(refs.cliCmd).not.toContain(BACKSLASH);
            expect(path.isAbsolute(refs.cliCmd.replace(/^node /, ''))).toBe(false);
        });
    });

    describe('precedence', () => {
        test('an explicit override wins over a local install', () => {
            const refs = resolveN8nacCommandRefs({
                projectRoot: withLocalInstall(tempDir),
                override: 'node /dev/cli.js',
                env: {},
            });

            expect(refs.source).toBe('override');
            expect(refs.cliCmd).toBe('node /dev/cli.js');
        });

        test('N8NAC_COMMAND wins over a local install', () => {
            const refs = resolveN8nacCommandRefs({
                projectRoot: withLocalInstall(tempDir),
                env: { N8NAC_COMMAND: 'n8nac-dev' },
            });

            expect(refs.source).toBe('env');
            expect(refs.cliCmd).toBe('n8nac-dev');
        });

        test('a workspace dev config wins over a local install', () => {
            withLocalInstall(tempDir);
            fs.writeFileSync(
                path.join(tempDir, '.n8nac-dev.json'),
                JSON.stringify({ commands: { n8nac: 'node ../cli/dist/index.js' } }),
                'utf8',
            );

            const refs = resolveN8nacCommandRefs({ projectRoot: tempDir, env: {} });

            expect(refs.source).toBe('workspace-config');
            expect(refs.cliCmd).toBe('node ../cli/dist/index.js');
        });
    });

    describe('generated AGENTS.md', () => {
        test('swaps the install-once nudge for an update note once a local install resolves', async () => {
            await new AiContextGenerator().generate(withLocalInstall(tempDir), '1.0.0');
            const agents = fs.readFileSync(path.join(tempDir, 'AGENTS.md'), 'utf-8');

            expect(agents).toContain('- n8nac command: `node node_modules/n8nac/dist/index.js`');
            expect(agents).not.toContain('Installing once removes it');
            expect(agents).toContain('Nothing updates it on its own');
            expect(agents).toContain('npm i n8nac@latest');
        });
    });
});
