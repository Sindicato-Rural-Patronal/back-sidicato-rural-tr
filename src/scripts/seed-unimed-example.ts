/**
 * Seed de EXEMPLO: cria 1 beneficiário Unimed de teste, amarrado ao primeiro
 * Usuário (UserData) que ainda não tem cadastro Unimed. Serve para visualizar a
 * tela /admin/unimed e testar Ficha/Termo PDF. O registro é marcado em `obs`
 * como exemplo — dá para excluir pela própria tela depois.
 *
 * Idempotente: se já existir um exemplo (obs começando com "EXEMPLO"), só imprime.
 *
 * Rodar no container: `node dist/scripts/seed-unimed-example.js`
 */
import 'dotenv/config';
import { createPrismaClient } from '../lib/prisma.js';

async function main() {
    const prisma = createPrismaClient({ DATABASE_URL: process.env.DATABASE_URL } as never);

    // Já existe um exemplo? Só mostra.
    const existing = await prisma.unimedBeneficiario.findFirst({
        where: { isDeleted: false, obs: { startsWith: 'EXEMPLO' } },
        include: { userData: { select: { id: true, name: true } } },
    });
    if (existing) {
        console.log('Exemplo Unimed já existe:');
        console.log(`  id=${existing.id}`);
        console.log(`  userDataId=${existing.userDataId}  (${existing.userData?.name ?? '?'})`);
        await prisma.$disconnect();
        return;
    }

    // Primeiro usuário sem cadastro Unimed (relação 1:1).
    const user = await prisma.userData.findFirst({
        where: { isDeleted: false, unimed: null },
        orderBy: { createdAt: 'asc' },
        select: { id: true, name: true },
    });
    if (!user) {
        console.log('Nenhum usuário disponível sem Unimed. Cadastre um usuário primeiro.');
        await prisma.$disconnect();
        return;
    }

    const beneficiario = await prisma.unimedBeneficiario.create({
        data: {
            userDataId: user.id,
            dataAdesao: new Date('2026-01-15'),
            tipoMovimento: 'INCLUSAO TITULAR',
            tipoDependente: null,
            grauDependencia: null,
            cns: '898001160000000',
            nomeMae: 'MARIA APARECIDA DA SILVA',
            profissao: 'PRODUTOR RURAL',
            plano: 'UNIMED NACIONAL',
            matricula: '0044123',
            empresa: 'SINDICATO RURAL DE TERRA ROXA',
            contratante: 'SINDICATO RURAL DE TERRA ROXA',
            titularId: null,
            motivo: null,
            obs: 'EXEMPLO PARA TESTE - PODE EXCLUIR',
            createdBy: null,
        },
    });

    console.log('Exemplo Unimed criado:');
    console.log(`  id=${beneficiario.id}`);
    console.log(`  userDataId=${user.id}  (${user.name})`);
    console.log('  Abra /admin/unimed para ver, editar e gerar Ficha/Termo.');
    await prisma.$disconnect();
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
