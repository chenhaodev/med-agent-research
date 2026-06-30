import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/providers/**/*.ts'],
      reportsDirectory: 'coverage',
      reporter: ['text', 'html'],
    },
  },
});
