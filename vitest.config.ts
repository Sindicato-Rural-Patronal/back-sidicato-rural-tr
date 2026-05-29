import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*_test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/usecase/**'],
      reporter: ['text', 'lcov'],
    },
  },
});
