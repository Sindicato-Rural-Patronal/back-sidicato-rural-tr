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
    // O banco é apagado a cada rodada: só aceita banco local (máquina ou CI).
    const host = new URL(dbUrl).hostname;
    if (!['localhost', '127.0.0.1'].includes(host)) {
        throw new Error(`DATABASE_TEST_URL precisa apontar para localhost (recebido: ${host}).`);
    }

    console.log('\n🔄 Preparing E2E test database...');
    try {
        // `migrate deploy` aplica as migrations de verdade (índices parciais,
        // CHECKs e dados iniciais que o schema.prisma não expressa) sem apagar
        // nada; cada arquivo de teste limpa as tabelas no beforeAll.
        execSync('npx prisma migrate deploy', {
            env: { ...process.env,
DATABASE_URL: dbUrl },
            stdio: 'pipe',
        });
        console.log('✅ E2E test database ready\n');
    } catch (err) {
        const { stderr, stdout } = err as {
 stderr?: Buffer;
stdout?: Buffer 
};
        console.error('❌ Failed to prepare test database');
        if (stderr) console.error(stderr.toString());
        if (stdout) console.error(stdout.toString());
        throw err;
    }
}
