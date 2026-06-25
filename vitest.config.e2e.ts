import { defineConfig } from 'vitest/config';
import { config } from 'dotenv';

config({ path: '.env.test' });

export default defineConfig({
    test: {
        include: ['src/e2e/**/*_test.ts'],
        globalSetup: './src/e2e/globalSetup.ts',
        environment: 'node',
        pool: 'forks',
        maxWorkers: 1,
        testTimeout: 30000,
        hookTimeout: 30000,
        env: {
            DATABASE_URL: process.env.DATABASE_TEST_URL ?? '',
            JWT_SECRET: 'e2e-test-secret-at-least-32-characters-long!!',
            NODE_ENV: 'test',
            STORAGE_TYPE: 'minio',
            STORAGE_BUCKET: 'avatars',
            BANNER_BUCKET: 'course-banners',
        },
    },
});
