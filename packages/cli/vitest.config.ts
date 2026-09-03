import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    server: {
      deps: {
        // Built artifacts are plain JS — load them with native node ESM instead of
        // pushing the whole CLI dist graph through Vite's transform pipeline.
        external: [/[\\/]dist[\\/]/],
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/index.ts']
    }
  }
});
