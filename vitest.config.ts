import { defineConfig, configDefaults } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Segredo fixo só para os testes de unidade (o usecase lê process.env.JWT_SECRET).
    env: { JWT_SECRET: 'test-jwt-secret-at-least-32-characters-long' },
    include: ['src/**/*_test.ts'],
    exclude: [...configDefaults.exclude, 'src/e2e/**'],
    coverage: {
      provider: 'v8',
      include: ['src/usecase/**'],
      reporter: ['text', 'lcov'],
    },
  },
});
