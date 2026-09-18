/**
 * Seed LOCAL (stack descartável): rule com TODAS as permissões + admin de
 * teste (credenciais do helper e2e) + usuários com identidade completa para
 * exercitar Unimed / Ficha / Termo. Nunca rodar contra staging/prod.
 *
 * Requer DATABASE_URL local no shell (NÃO carrega .env de propósito).
 * Rodar: npx tsx src/scripts/seed-local-e2e.ts
 */
import { hash } from 'bcrypt';
import {
    createTestPrisma,
    E2E_ADMIN_USERNAME,
    E2E_ADMIN_PASSWORD,
} from '../e2e/helpers/db.js';
import type { Permission } from '../generated/prisma/enums.js';

const ALL_PERMISSIONS: Permission[] = [
    'CREATE_USER', 'UPDATE_USER', 'DELETE_USER', 'READ_USER',
    'CREATE_COURSE', 'UPDATE_COURSE', 'DELETE_COURSE', 'READ_COURSE',
    'CREATE_RULE', 'UPDATE_RULE', 'DELETE_RULE', 'READ_RULE',
    'CREATE_USER_ADMIN', 'UPDATE_USER_ADMIN', 'DELETE_USER_ADMIN', 'READ_USER_ADMIN',
    'CREATE_NEWS', 'UPDATE_NEWS', 'DELETE_NEWS', 'READ_NEWS',
    'READ_CONTACT', 'UPDATE_CONTACT',
    'CREATE_BANNER', 'UPDATE_BANNER', 'DELETE_BANNER', 'READ_BANNER',
    'CREATE_MARKET_QUOTE', 'UPDATE_MARKET_QUOTE', 'DELETE_MARKET_QUOTE', 'READ_MARKET_QUOTE',
    'READ_AUDIT',
    'CREATE_FINANCE', 'UPDATE_FINANCE', 'DELETE_FINANCE', 'READ_FINANCE',
];

const url = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(url)) {
    throw new Error('Recusando: DATABASE_URL precisa apontar para localhost (stack descartável).');
}

async function main() {
    const prisma = createTestPrisma();

    const rule = await prisma.rule.create({
        data: { name: 'GESTOR',
description: 'Seed local — todas as permissões',
permissions: ALL_PERMISSIONS },
    });

    const adminData = await prisma.userData.create({
        data: { name: 'ADMIN LOCAL',
email: 'e2eadmin@test.local',
phone: '44900000000' },
    });
    await prisma.userAdmin.create({
        data: {
            username: E2E_ADMIN_USERNAME,
            passwordHash: await hash(E2E_ADMIN_PASSWORD, 4),
            userDataId: adminData.id,
            rulesId: rule.id,
        },
    });

    // Identidade completa (MAIÚSCULO sem acento — padrão do sistema), CPFs válidos.
    const users = await Promise.all([
        prisma.userData.create({ data: {
            name: 'JOAO CARLOS PEREIRA',
email: 'joao@test.local',
phone: '44911111111',
            cpf: '12345678909',
rg: '1234567',
rgIssuer: 'SSP/PR',
maritalStatus: 'MARRIED',
            birthDate: new Date('1980-05-10'),
nationality: 'BRASILEIRA',
birthPlace: 'TERRA ROXA',
            gender: 'MALE',
memberStatus: 'ACTIVE',
        } }),
        prisma.userData.create({ data: {
            name: 'MARIA APARECIDA SOUZA',
email: 'maria@test.local',
phone: '44922222222',
            cpf: '98765432100',
rg: '7654321',
rgIssuer: 'SSP/PR',
maritalStatus: 'SINGLE',
            birthDate: new Date('1992-08-22'),
nationality: 'BRASILEIRA',
birthPlace: 'TERRA ROXA',
            gender: 'FEMALE',
memberStatus: 'ACTIVE',
        } }),
        prisma.userData.create({ data: {
            name: 'ANTONIO FERREIRA LIMA',
email: 'antonio@test.local',
phone: '44933333333',
            cpf: '11144477735',
rg: '5551234',
rgIssuer: 'SSP/PR',
maritalStatus: 'WIDOWED',
            birthDate: new Date('1965-01-30'),
nationality: 'BRASILEIRA',
birthPlace: 'TERRA ROXA',
            gender: 'MALE',
memberStatus: 'ACTIVE',
        } }),
    ]);

    // Endereço principal do JOAO (Termo usa primaryPropertyId → Property → Address).
    const address = await prisma.address.create({ data: {
        type: 'URBAN',
street: 'RUA DAS FLORES',
number: '123',
neighborhood: 'CENTRO',
        city: 'TERRA ROXA',
state: 'PR',
zipCode: '85990000',
    } });
    const property = await prisma.property.create({ data: {
        userDataId: users[0].id,
name: 'RESIDENCIA',
addressId: address.id,
    } });
    await prisma.userData.update({ where: { id: users[0].id },
data: { primaryPropertyId: property.id } });

    console.log('Seed local OK');
    console.log(`  rule=${rule.name} (${ALL_PERMISSIONS.length} perms)`);
    console.log(`  admin=${E2E_ADMIN_USERNAME}`);
    for (const u of users) console.log(`  user ${u.name} id=${u.id}`);
    await prisma.$disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
