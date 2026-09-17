/**
 * Migração ÚNICA: normaliza dados existentes de identidade para MAIÚSCULO sem
 * acento (mesma regra do frontend), preservando e-mail/senha/usuário/documentos/
 * telefones/CEP/datas/valores/URLs/markdown. Idempotente (rodar 2x não muda nada).
 *
 * Rodar no container: `node dist/scripts/normalize-uppercase.js`
 */
import 'dotenv/config';
import { createPrismaClient } from '../lib/prisma.js';

function up(s: string): string {
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
}

async function main() {
    const prisma = createPrismaClient({ DATABASE_URL: process.env.DATABASE_URL } as never);
    let total = 0;

    async function run(
        label: string,
        rows: Array<Record<string, unknown> & { id: string }>,
        fields: string[],
        update: (id: string, data: Record<string, string>) => Promise<unknown>,
    ) {
        let n = 0;
        for (const row of rows) {
            const data: Record<string, string> = {};
            for (const f of fields) {
                const v = row[f];
                if (typeof v === 'string' && v.length > 0) {
                    const nv = up(v);
                    if (nv !== v) data[f] = nv;
                }
            }
            if (Object.keys(data).length > 0) {
                await update(row.id, data);
                n++;
            }
        }
        console.log(`  ${label.padEnd(22)} ${n} atualizados`);
        total += n;
    }

    console.log('Normalizando (MAIÚSCULO sem acento)...');

    await run('userData', await prisma.userData.findMany(),
        ['name', 'nickname', 'birthPlace', 'nationality', 'functionalCategory', 'memberClassification', 'memberType', 'boardPosition', 'memberNotes', 'rgIssuer'],
        (id, data) => prisma.userData.update({ where: { id },
data: data as never }));

    await run('address', await prisma.address.findMany(),
        ['city', 'state', 'complement', 'notes', 'street', 'neighborhood', 'localityName', 'road'],
        (id, data) => prisma.address.update({ where: { id },
data: data as never }));

    await run('course', await prisma.course.findMany(),
        ['name', 'observations'],
        (id, data) => prisma.course.update({ where: { id },
data: data as never }));

    await run('news', await prisma.news.findMany(),
        ['title', 'summary'],
        (id, data) => prisma.news.update({ where: { id },
data: data as never }));

    await run('banner', await prisma.banner.findMany(),
        ['title', 'subtitle'],
        (id, data) => prisma.banner.update({ where: { id },
data: data as never }));

    await run('room', await prisma.room.findMany(),
        ['name', 'description'],
        (id, data) => prisma.room.update({ where: { id },
data: data as never }));

    await run('property', await prisma.property.findMany(),
        ['name'],
        (id, data) => prisma.property.update({ where: { id },
data: data as never }));

    await run('financialCategory', await prisma.financialCategory.findMany(),
        ['name'],
        (id, data) => prisma.financialCategory.update({ where: { id },
data: data as never }));

    await run('financialAccount', await prisma.financialAccount.findMany(),
        ['name'],
        (id, data) => prisma.financialAccount.update({ where: { id },
data: data as never }));

    await run('userRelation', await prisma.userRelation.findMany(),
        ['label'],
        (id, data) => prisma.userRelation.update({ where: { id },
data: data as never }));

    await run('marketQuote', await prisma.marketQuote.findMany(),
        ['label'],
        (id, data) => prisma.marketQuote.update({ where: { id },
data: data as never }));

    await run('courseInstructor', await prisma.courseInstructor.findMany(),
        ['title', 'category'],
        (id, data) => prisma.courseInstructor.update({ where: { id },
data: data as never }));

    // FinancialTransaction: campos planos + empenho (JSON).
    const empKeys = ['nomeFantasia', 'razaoSocial', 'endereco', 'bairro', 'cidade', 'uf', 'banco'];
    const txs = await prisma.financialTransaction.findMany();
    let txPlain = 0;
    let txEmp = 0;
    for (const t of txs) {
        const data: Record<string, unknown> = {};
        for (const f of ['description', 'notes'] as const) {
            const v = t[f];
            if (typeof v === 'string' && v.length > 0 && up(v) !== v) data[f] = up(v);
        }
        const emp = t.empenho as Record<string, unknown> | null;
        if (emp && typeof emp === 'object') {
            let changed = false;
            const next: Record<string, unknown> = { ...emp };
            for (const k of empKeys) {
                const v = emp[k];
                if (typeof v === 'string' && v.length > 0 && up(v) !== v) { next[k] = up(v); changed = true; }
            }
            if (changed) { data.empenho = next; txEmp++; }
        }
        if (Object.keys(data).length > 0) {
            if (data.description || data.notes) txPlain++;
            await prisma.financialTransaction.update({ where: { id: t.id },
data: data as never });
        }
    }
    console.log(`  financialTransaction   ${txPlain} campos + ${txEmp} empenho atualizados`);
    total += txPlain + txEmp;

    console.log(`\nTotal de linhas alteradas: ${total}`);
    await prisma.$disconnect();
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
