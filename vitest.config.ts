import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.{ts,js}'],
    coverage: {
      provider: 'v8',
      include: ['js/**/*.js'],
      exclude: ['js/config.js'],
      reportsDirectory: 'coverage',
      reporter: ['text', 'html'],
    },
  },
});
