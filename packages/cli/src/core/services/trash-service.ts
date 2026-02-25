import fs from 'fs';
import path from 'path';

export class TrashService {
    private trashDir: string;

    constructor(baseDir: string) {
        this.trashDir = path.join(baseDir, '.trash');
    }

    /**
     * Moves a file to the archive directory.
     * @param filePath Absolute path to the file to move
     * @param filename Name to use in the archive
     */
    async archiveFile(filePath: string, filename: string): Promise<string> {
        if (!fs.existsSync(this.trashDir)) {
            fs.mkdirSync(this.trashDir, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const archivedName = `${timestamp}_${filename}`;
        const targetPath = path.join(this.trashDir, archivedName);

        if (fs.existsSync(filePath)) {
            fs.renameSync(filePath, targetPath);
        }

        return targetPath;
    }

    /**
     * Saves a workflow object to the archive directory.
     * @param workflow The workflow object to save
     * @param filename Base filename
     */
    async archiveWorkflow(workflow: any, filename: string): Promise<string> {
        if (!fs.existsSync(this.trashDir)) {
            fs.mkdirSync(this.trashDir, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const archivedName = `${timestamp}_${filename}`;
        const targetPath = path.join(this.trashDir, archivedName);

        fs.writeFileSync(targetPath, JSON.stringify(workflow, null, 2));

        return targetPath;
    }
}
