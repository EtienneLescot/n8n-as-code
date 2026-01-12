import { AiContextGenerator } from '../packages/agent-cli/src/services/ai-context-generator.js';
import fs from 'fs';
import path from 'path';

async function test() {
    const testDir = path.resolve('./temp-test-ai-context');
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir);

    const cursorPath = path.join(testDir, '.cursorrules');
    const agentsPath = path.join(testDir, 'AGENTS.md');

    // 1. Create with existing content
    fs.writeFileSync(cursorPath, 'EXISTING_CURSOR_CONTENT\n');
    fs.writeFileSync(agentsPath, '# User Original AGENTS\nSome content here.\n');

    const generator = new AiContextGenerator();

    console.log('--- RUN 1 (Injection) ---');
    await generator.generate(testDir, '1.0.0');

    console.log('.cursorrules content:');
    console.log(fs.readFileSync(cursorPath, 'utf8'));
    console.log('AGENTS.md content:');
    console.log(fs.readFileSync(agentsPath, 'utf8'));

    console.log('\n--- RUN 2 (Update) ---');
    await generator.generate(testDir, '2.0.0');

    const updatedAgents = fs.readFileSync(agentsPath, 'utf8');
    console.log('AGENTS.md updated content (should have v2.0.0 and no duplication):');
    console.log(updatedAgents);

    if (updatedAgents.includes('2.0.0') && !updatedAgents.includes('1.0.0') && updatedAgents.includes('# User Original AGENTS')) {
        console.log('✅ SUCCESS: Merge and update logic works!');
        fs.rmSync(testDir, { recursive: true, force: true });
    } else {
        console.log('❌ FAILURE: Merge or update logic failed.');
    }
}

test();
