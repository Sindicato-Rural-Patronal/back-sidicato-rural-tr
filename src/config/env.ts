// config/env.ts
import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    DATABASE_URL: z.string(),
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    STORAGE_TYPE: z.enum(['minio', 's3']).default('minio'),
    MINIO_ENDPOINT: z.string().optional(),
    MINIO_ACCESS_KEY: z.string().optional(),
    MINIO_SECRET_KEY: z.string().optional(),
    STORAGE_BUCKET: z.string().default('avatars'),
    CORS_ORIGIN: z.string().default('*'),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(): Env {
    const result = envSchema.safeParse(process.env);

    if (!result.success) {
        const errors = result.error.issues.map(issue => {
            const path = issue.path.join('.');
            return `  - ${path}: ${issue.message}`;
        });
        throw new Error(`❌ Invalid environment variables:\n${errors.join('\n')}`);
    }

    return result.data;
}
