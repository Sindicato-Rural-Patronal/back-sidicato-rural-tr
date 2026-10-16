import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { hash } from 'bcrypt';
import type { PrismaClient } from '../generated/prisma/client.js';
import type { Permission } from '../generated/prisma/enums.js';
import { createTestApp } from './helpers/create-test-app.js';
import {
    createTestPrisma,
    cleanDatabase,
    seedSuperAdmin,
    loginAndGetToken,
    bearer,
    E2E_ADMIN_USERNAME,
    E2E_ADMIN_PASSWORD,
} from './helpers/db.js';

// SR-007: um admin com permissões de gestão (editar admins, editar regras,
// excluir pessoas) não consegue tomar nem derrubar um admin mais forte.

let app: FastifyInstance;
let prisma: PrismaClient;
let superAdmin: {
 id: string;
userDataId: string;
rulesId: string 
};
let gestorToken: string;
let gestorAdminId: string;
let seq = 0;

const GESTOR: Permission[] = [
    'READ_USER', 'DELETE_USER',
    'READ_USER_ADMIN', 'CREATE_USER_ADMIN', 'UPDATE_USER_ADMIN', 'DELETE_USER_ADMIN',
    'READ_RULE', 'UPDATE_RULE',
];

async function adminWith(permissions: Permission[]) {
    seq += 1;
    const rule = await prisma.rule.create({ data: { name: `ESC_RULE_${seq}`,
description: 'E2E',
permissions } });
    const person = await prisma.userData.create({ data: { name: `Pessoa ${seq}`,
phone: `4498000${String(seq).padStart(4, '0')}` } });
    const admin = await prisma.userAdmin.create({
        data: { username: `esc${seq}`,
passwordHash: await hash('escPass123!', 4),
userDataId: person.id,
rulesId: rule.id },
    });
    return { admin,
rule,
person,
login: () => loginAndGetToken(app, `esc${seq}`, 'escPass123!') };
}

beforeAll(async () => {
    prisma = createTestPrisma();
    await cleanDatabase(prisma);
    const seeded = await seedSuperAdmin(prisma);
    superAdmin = { id: seeded.userAdmin.id,
userDataId: seeded.userData.id,
rulesId: seeded.rule.id };
    app = await createTestApp(prisma);
    const gestor = await adminWith(GESTOR);
    gestorAdminId = gestor.admin.id;
    gestorToken = await gestor.login();
});

afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
});

describe('editar admin mais forte', () => {
    it('trocar a senha do super admin → 403, e a senha antiga continua valendo', async () => {
        const res = await app.inject({ method: 'PATCH',
url: `/admin/users/${superAdmin.id}`,
headers: bearer(gestorToken),
payload: { password: 'tomeiAConta123' } });
        expect(res.statusCode).toBe(403);
        await expect(loginAndGetToken(app, E2E_ADMIN_USERNAME, E2E_ADMIN_PASSWORD)).resolves.toBeTruthy();
        await expect(loginAndGetToken(app, E2E_ADMIN_USERNAME, 'tomeiAConta123')).rejects.toThrow();
    });

    it('editar admin mais fraco continua funcionando', async () => {
        const fraco = await adminWith(['READ_USER']);
        const res = await app.inject({ method: 'PATCH',
url: `/admin/users/${fraco.admin.id}`,
headers: bearer(gestorToken),
payload: { password: 'novaSenha123' } });
        expect(res.statusCode).toBe(200);
    });
});

describe('editar regra mais forte', () => {
    it('esvaziar a SUPER_RULE → 403, e ela continua com todas as permissões', async () => {
        const before = await prisma.rule.findUniqueOrThrow({ where: { id: superAdmin.rulesId } });
        const res = await app.inject({ method: 'PATCH',
url: `/rules/${superAdmin.rulesId}`,
headers: bearer(gestorToken),
payload: { permissions: ['READ_USER'] } });
        expect(res.statusCode).toBe(403);
        const after = await prisma.rule.findUniqueOrThrow({ where: { id: superAdmin.rulesId } });
        expect(after.permissions).toEqual(before.permissions);
    });
});

describe('excluir pessoa que tem login', () => {
    it('a pessoa do super admin → 403, e o login dele continua', async () => {
        const res = await app.inject({ method: 'DELETE',
url: `/users/${superAdmin.userDataId}`,
headers: bearer(gestorToken) });
        expect(res.statusCode).toBe(403);
        const admin = await prisma.userAdmin.findUniqueOrThrow({ where: { id: superAdmin.id } });
        expect(admin.isDeleted).toBe(false);
    });

    it('sem DELETE_USER_ADMIN → 403 mesmo para admin mais fraco', async () => {
        const secretaria = await adminWith(['DELETE_USER', 'READ_USER']);
        const alvo = await adminWith(['READ_USER']);
        const res = await app.inject({ method: 'DELETE',
url: `/users/${alvo.person.id}`,
headers: bearer(await secretaria.login()) });
        expect(res.statusCode).toBe(403);
    });

    it('o próprio cadastro → 400', async () => {
        const gestorPerson = await prisma.userAdmin.findUniqueOrThrow({ where: { id: gestorAdminId } });
        const res = await app.inject({ method: 'DELETE',
url: `/users/${gestorPerson.userDataId}`,
headers: bearer(gestorToken) });
        expect(res.statusCode).toBe(400);
    });

    it('admin mais fraco, com DELETE_USER_ADMIN → 204, e o login cai junto', async () => {
        const alvo = await adminWith(['READ_USER']);
        const res = await app.inject({ method: 'DELETE',
url: `/users/${alvo.person.id}`,
headers: bearer(gestorToken) });
        expect(res.statusCode).toBe(204);
        const admin = await prisma.userAdmin.findUniqueOrThrow({ where: { id: alvo.admin.id } });
        expect(admin.isDeleted).toBe(true);
    });

    it('pessoa sem login: DELETE_USER basta', async () => {
        const secretaria = await adminWith(['DELETE_USER', 'READ_USER']);
        const person = await prisma.userData.create({ data: { name: 'Sem Login',
phone: '44970000001' } });
        const res = await app.inject({ method: 'DELETE',
url: `/users/${person.id}`,
headers: bearer(await secretaria.login()) });
        expect(res.statusCode).toBe(204);
    });
});

describe('cadastrar admin', () => {
    it.each([
        ['senha vazia', { username: 'novo.admin',
password: '' }, 'A senha deve ter ao menos 8 caracteres.'],
        ['senha curta', { username: 'novo.admin',
password: '1234567' }, 'A senha deve ter ao menos 8 caracteres.'],
        ['usuário em branco', { username: '   ',
password: 'senhaBoa123' }, 'Informe o usuário.'],
    ])('%s → 400', async (_caso, credentials, message) => {
        const person = await prisma.userData.create({ data: { name: 'Futuro Admin',
phone: '44970000002' } });
        const rule = await prisma.rule.create({ data: { name: `ESC_NEW_${++seq}`,
description: 'E2E',
permissions: ['READ_USER'] } });
        const res = await app.inject({ method: 'POST',
url: '/admin/users',
headers: bearer(gestorToken),
payload: { ...credentials,
userDataId: person.id,
userRole: rule.id } });
        expect(res.statusCode).toBe(400);
        expect(JSON.parse(res.body).error).toBe(message);
        expect(await prisma.userAdmin.count({ where: { userDataId: person.id } })).toBe(0);
    });
});
