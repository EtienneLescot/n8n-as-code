/**
 * Public library surface of @n8n-as-code/cli
 * Re-exports everything that was previously exposed by @n8n-as-code/sync
 * so consumers can simply change their import path without touching business logic.
 */
export * from './core/index.js';
export { ConfigService } from './services/config-service.js';
