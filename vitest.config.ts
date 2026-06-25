import { defineConfig, configDefaults } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*_test.ts'],
    exclude: [...configDefaults.exclude, 'src/e2e/**'],
    coverage: {
      provider: 'v8',
      include: ['src/usecase/**'],
      reporter: ['text', 'lcov'],
    },
  },
});
