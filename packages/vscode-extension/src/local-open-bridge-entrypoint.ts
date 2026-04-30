import { ensureLocalN8nAuthBridgeRunningInProcess } from '@n8n-as-code/n8n-manager-core';

async function main(): Promise<void> {
    await ensureLocalN8nAuthBridgeRunningInProcess();
}

void main().catch((error) => {
    console.error(error);
    process.exit(1);
});
