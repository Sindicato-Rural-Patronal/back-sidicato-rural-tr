import { execSync } from 'node:child_process';
import { config } from 'dotenv';

export async function setup() {
    config({ path: '.env.test',
override: true });

    const dbUrl = process.env.DATABASE_TEST_URL;
    if (!dbUrl) {
        throw new Error(
            'DATABASE_TEST_URL is required for E2E tests.\n' +
                'Create a .env.test file with:\n' +
                '  DATABASE_TEST_URL=postgresql://user:pass@localhost:5432/sindicato_test\n' +
                '  (use a SEPARATE test database — it will be wiped on every run)',
        );
    }

    console.log('\n🔄 Resetting E2E test database...');
    try {
        execSync('npx prisma db push --force-reset --skip-generate', {
            env: { ...process.env,
DATABASE_URL: dbUrl },
            stdio: 'pipe',
        });
        console.log('✅ E2E test database ready\n');
    } catch (err: any) {
        const stderr = err.stderr?.toString() ?? '';
        const stdout = err.stdout?.toString() ?? '';
        console.error('❌ Failed to reset test database');
        if (stderr) console.error(stderr);
        if (stdout) console.error(stdout);
        throw err;
    }
}
