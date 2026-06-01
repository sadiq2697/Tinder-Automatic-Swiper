import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Expose describe/it/expect as globals so test files need no imports.
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.js'],
  },
});
