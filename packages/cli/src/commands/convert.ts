import chalk from 'chalk';
import ora from 'ora';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, basename, extname, join } from 'path';
import {
    JsonToAstParser,
    AstToTypeScriptGenerator,
    TypeScriptParser,
    WorkflowBuilder
} from '@n8n-as-code/transformer';
import inquirer from 'inquirer';

export class ConvertCommand {
    /**
     * Convert workflow: JSON → TypeScript or TypeScript → JSON
     */
    async run(inputPath: string, options: { output?: string; force?: boolean; format?: 'json' | 'typescript' }): Promise<void> {
        const absoluteInput = resolve(process.cwd(), inputPath);
        
        if (!existsSync(absoluteInput)) {
            console.error(chalk.red(`❌ File not found: ${inputPath}`));
            process.exit(1);
        }

        const inputExt = extname(absoluteInput);
        const isTypeScript = inputExt === '.ts' || absoluteInput.endsWith('.workflow.ts');
        const isJson = inputExt === '.json';

        if (!isTypeScript && !isJson) {
            console.error(chalk.red(`❌ Unsupported file type: ${inputExt}`));
            console.error(chalk.gray('   Supported: .json, .ts, .workflow.ts'));
            process.exit(1);
        }

        // Determine target format
        let targetFormat: 'json' | 'typescript';
        if (options.format) {
            targetFormat = options.format;
        } else {
            // Auto-detect: JSON → TS, TS → JSON
            targetFormat = isJson ? 'typescript' : 'json';
        }

        // Validate conversion direction
        if (isJson && targetFormat === 'json') {
            console.error(chalk.yellow('⚠️  File is already JSON. Nothing to convert.'));
            return;
        }
        if (isTypeScript && targetFormat === 'typescript') {
            console.error(chalk.yellow('⚠️  File is already TypeScript. Nothing to convert.'));
            return;
        }

        // Determine output path
        let outputPath: string;
        if (options.output) {
            outputPath = resolve(process.cwd(), options.output);
        } else {
            // Auto-generate output path
            const baseName = basename(absoluteInput, inputExt);
            const dir = join(absoluteInput, '..');
            outputPath = targetFormat === 'typescript'
                ? join(dir, `${baseName.replace('.workflow', '')}.workflow.ts`)
                : join(dir, `${baseName.replace('.workflow', '')}.json`);
        }

        // Check if output exists
        if (existsSync(outputPath) && !options.force) {
            const { overwrite } = await inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'overwrite',
                    message: `Output file exists: ${basename(outputPath)}. Overwrite?`,
                    default: false
                }
            ]);
            
            if (!overwrite) {
                console.log(chalk.gray('Conversion cancelled.'));
                return;
            }
        }

        const spinner = ora(`Converting ${isJson ? 'JSON → TypeScript' : 'TypeScript → JSON'}...`).start();

        try {
            const inputContent = readFileSync(absoluteInput, 'utf-8');
            let outputContent: string;

            if (targetFormat === 'typescript') {
                // JSON → TypeScript
                const workflow = JSON.parse(inputContent);
                const parser = new JsonToAstParser();
                const ast = parser.parse(workflow);
                const generator = new AstToTypeScriptGenerator();
                outputContent = await generator.generate(ast, {
                    format: true,
                    commentStyle: 'verbose'
                });
            } else {
                // TypeScript → JSON
                const parser = new TypeScriptParser();
                const ast = await parser.parseCode(inputContent);
                const builder = new WorkflowBuilder();
                const workflow = builder.build(ast);
                outputContent = JSON.stringify(workflow, null, 2);
            }

            writeFileSync(outputPath, outputContent, 'utf-8');
            spinner.succeed(chalk.green('Conversion successful!'));
            
            console.log(chalk.cyan('\n📊 Details:'));
            console.log(chalk.gray(`   Input:  ${basename(absoluteInput)}`));
            console.log(chalk.gray(`   Output: ${basename(outputPath)}`));
            console.log(chalk.gray(`   Size:   ${outputContent.length} bytes\n`));
        } catch (error: any) {
            spinner.fail(chalk.red('Conversion failed'));
            console.error(chalk.red(`❌ ${error.message}`));
            if (error.stack) {
                console.error(chalk.gray(error.stack));
            }
            process.exit(1);
        }
    }

    /**
     * Batch convert all workflows in a directory
     */
    async batch(dirPath: string, options: { format: 'json' | 'typescript'; force?: boolean }): Promise<void> {
        const absoluteDir = resolve(process.cwd(), dirPath);
        
        if (!existsSync(absoluteDir)) {
            console.error(chalk.red(`❌ Directory not found: ${dirPath}`));
            process.exit(1);
        }

        const fs = await import('fs/promises');
        const files = await fs.readdir(absoluteDir);
        
        const sourceExt = options.format === 'typescript' ? '.json' : '.workflow.ts';
        const targetFiles = files.filter(f => f.endsWith(sourceExt));

        if (targetFiles.length === 0) {
            console.log(chalk.yellow(`⚠️  No ${sourceExt} files found in ${dirPath}`));
            return;
        }

        console.log(chalk.cyan(`\n🔄 Found ${targetFiles.length} file(s) to convert\n`));

        let converted = 0;
        let failed = 0;

        for (const file of targetFiles) {
            const inputPath = join(absoluteDir, file);
            const baseName = basename(file, sourceExt);
            const targetExt = options.format === 'typescript' ? '.workflow.ts' : '.json';
            const outputPath = join(absoluteDir, `${baseName}${targetExt}`);

            try {
                const inputContent = readFileSync(inputPath, 'utf-8');
                let outputContent: string;

                if (options.format === 'typescript') {
                    // JSON → TypeScript
                    const workflow = JSON.parse(inputContent);
                    const parser = new JsonToAstParser();
                    const ast = parser.parse(workflow);
                    const generator = new AstToTypeScriptGenerator();
                    outputContent = await generator.generate(ast, {
                        format: true,
                        commentStyle: 'verbose'
                    });
                } else {
                    // TypeScript → JSON
                    const parser = new TypeScriptParser();
                    const ast = await parser.parseCode(inputContent);
                    const builder = new WorkflowBuilder();
                    const workflow = builder.build(ast);
                    outputContent = JSON.stringify(workflow, null, 2);
                }

                writeFileSync(outputPath, outputContent, 'utf-8');
                console.log(chalk.green(`✅ ${file} → ${basename(outputPath)}`));
                converted++;
            } catch (error: any) {
                console.error(chalk.red(`❌ ${file}: ${error.message}`));
                failed++;
            }
        }

        console.log(chalk.cyan(`\n📊 Summary:`));
        console.log(chalk.gray(`   Converted: ${converted}`));
        if (failed > 0) {
            console.log(chalk.red(`   Failed:    ${failed}`));
        }
        console.log();
    }
}
