import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '../generated/prisma/client.js';
import { uniqueViolationTarget } from '../lib/prisma-errors.js';
import { createTestApp } from './helpers/create-test-app.js';
import { createTestPrisma, cleanDatabase, seedSuperAdmin, loginAndGetToken, bearer } from './helpers/db.js';

// SR-069: com o `@prisma/adapter-pg` o P2002 não traz `meta.target`; o índice
// violado vem em `meta.driverAdapterError.cause.constraint.index`. O
// `uniqueViolationFields` antigo só lia o `meta.target` e devolvia sempre `[]`,
// então o `register-full` e o cadastro de administrador respondiam como se
// qualquer violação fosse a do CPF ou a do usuário.
//
// Estes testes usam o banco de verdade, sem mock do erro. Para provocar o
// P2002 no meio de uma requisição, uma transação do teste grava a linha e fica
// aberta (a requisição não a enxerga e passa pelas conferências); a requisição
// bate no índice e espera; o teste confirma a transação e o Postgres devolve
// o P2002 à requisição.

let app: FastifyInstance;
let prisma: PrismaClient;
let token: string;
let ruleId: string;
let seq = 0;

/** CPF válido (dígitos verificadores certos) a partir de 9 dígitos. */
function cpfFrom(base: string): string {
    const digits = base.split('').map(Number);
    for (const factor of [10, 11]) {
        const sum = digits.reduce((acc, d, i) => acc + d * (factor - i), 0);
        const rem = (sum * 10) % 11;
        digits.push(rem >= 10 ? 0 : rem);
    }
    return digits.join('');
}
const nextCpf = () => cpfFrom(String(500000000 + ++seq * 7211).slice(0, 9));

const PHONE = '44991230000';

async function person(name: string, cpf: string | null = nextCpf()) {
    return prisma.userData.create({ data: { name,
phone: PHONE,
cpf } });
}

async function courseWithSeats(seats: number) {
    seq += 1;
    const room = await prisma.room.create({ data: { name: `SALA UNICO ${seq}`,
description: 'x',
maxCapacity: seats } });
    const course = await prisma.course.create({
        data: {
            name: `CURSO UNICO ${seq}`,
            description: 'x',
            roomId: room.id,
            status: 'PUBLIC',
            startTime: new Date('2032-08-10T08:00:00Z'),
            endTime: new Date('2032-08-12T17:00:00Z'),
        },
    });
    return course.id;
}

/** Transação do teste: grava e fica aberta até o `commit()`. */
function openTransaction(write: (tx: PrismaClient) => Promise<unknown>) {
    let commit!: () => void;
    const released = new Promise<void>(resolve => {
        commit = resolve;
    });
    let signalWritten!: () => void;
    const written = new Promise<void>(resolve => {
        signalWritten = resolve;
    });
    const done = prisma.$transaction(
        async tx => {
            await write(tx as unknown as PrismaClient);
            signalWritten();
            await released;
        },
        { timeout: 20000 },
    );
    return {
        /** Resolve quando a linha foi gravada (sem confirmar); rejeita se a gravação falhou. */
        written: Promise.race([written, done]),
        commit,
        done,
    };
}

/** Espera uma requisição ficar parada num índice único à espera da transação aberta. */
async function waitForBlockedWrite(): Promise<void> {
    for (let i = 0; i < 200; i++) {
        const rows = await prisma.$queryRaw<{ n: bigint }[]>`
            SELECT count(*) AS n FROM pg_stat_activity
            WHERE datname = current_database() AND wait_event_type = 'Lock' AND wait_event = 'transactionid'`;
        if (Number(rows[0].n) > 0) return;
        await new Promise(resolve => setTimeout(resolve, 25));
    }
    throw new Error('A requisição não chegou a esperar pelo índice único.');
}

/** Roda `request` com a linha de `write` gravada e ainda não confirmada, depois confirma. */
async function raceAgainstOpenTransaction<T>(
    write: (tx: PrismaClient) => Promise<unknown>,
    request: () => Promise<T>,
): Promise<T> {
    const tx = openTransaction(write);
    await tx.written;
    const pending = request();
    await waitForBlockedWrite();
    tx.commit();
    await tx.done;
    return pending;
}

beforeAll(async () => {
    prisma = createTestPrisma();
    await cleanDatabase(prisma);
    const seeded = await seedSuperAdmin(prisma);
    ruleId = seeded.rule.id;
    app = await createTestApp(prisma);
    token = await loginAndGetToken(app);
});

afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
});

/** O erro que o Prisma levanta com o adapter-pg ao violar o índice. */
async function violation(write: () => Promise<unknown>): Promise<unknown> {
    try {
        await write();
    } catch (e) {
        return e;
    }
    throw new Error('A gravação devia ter violado um índice único.');
}

describe('P2002 com o adapter-pg: o índice violado vem no erro', () => {
    it('inscrição ativa repetida no curso', async () => {
        const courseId = await courseWithSeats(10);
        const p = await person('PESSOA INDICE INSCRICAO');
        await prisma.courseUserRegistration.create({ data: { courseId,
userDataId: p.id } });
        const e = await violation(() => prisma.courseUserRegistration.create({ data: { courseId,
userDataId: p.id } }));
        expect(uniqueViolationTarget(e)).toContain('courseUserRegistration_courseId_userDataId_active_key');
    });

    it('CPF de pessoa ativa repetido', async () => {
        const cpf = nextCpf();
        await person('PESSOA INDICE CPF UM', cpf);
        const e = await violation(() => person('PESSOA INDICE CPF DOIS', cpf));
        expect(uniqueViolationTarget(e)).toContain('UserData_cpf_active_unique');
    });

    it('usuário de administrador ativo repetido', async () => {
        const a = await person('ADMIN INDICE USUARIO UM');
        const b = await person('ADMIN INDICE USUARIO DOIS');
        await prisma.userAdmin.create({ data: { username: 'indice-usuario',
passwordHash: 'x',
userDataId: a.id,
rulesId: ruleId } });
        const e = await violation(() => prisma.userAdmin.create({ data: { username: 'indice-usuario',
passwordHash: 'x',
userDataId: b.id,
rulesId: ruleId } }));
        expect(uniqueViolationTarget(e)).toContain('UserAdmin_username_active_key');
    });

    it('pessoa que já tem conta de administrador', async () => {
        const a = await person('ADMIN INDICE PESSOA');
        await prisma.userAdmin.create({ data: { username: 'indice-pessoa-um',
passwordHash: 'x',
userDataId: a.id,
rulesId: ruleId } });
        const e = await violation(() => prisma.userAdmin.create({ data: { username: 'indice-pessoa-dois',
passwordHash: 'x',
userDataId: a.id,
rulesId: ruleId } }));
        expect(uniqueViolationTarget(e)).toContain('UserAdmin_userDataId_key');
    });
});

describe('POST /courses/:id/register-full: a mensagem segue o índice violado', () => {
    const full = (courseId: string, payload: Record<string, unknown>) =>
        app.inject({ method: 'POST',
url: `/courses/${courseId}/register-full`,
payload });

    it('inscrição gravada ao mesmo tempo por outro caminho → "já está inscrita", não "CPF já cadastrado"', async () => {
        const courseId = await courseWithSeats(10);
        const p = await person('JA INSCRITA NA CORRIDA');
        const res = await raceAgainstOpenTransaction(
            tx => tx.courseUserRegistration.create({ data: { courseId,
userDataId: p.id } }),
            () => full(courseId, { name: 'JA INSCRITA NA CORRIDA',
phone: PHONE,
cpf: p.cpf }),
        );
        expect(res.statusCode, res.body).toBe(409);
        expect(JSON.parse(res.body).error).toBe('Esta pessoa já está inscrita neste curso.');
        expect(await prisma.courseUserRegistration.count({ where: { courseId } })).toBe(1);
    });

    it('CPF criado ao mesmo tempo por outro cadastro → "CPF já cadastrado para outra pessoa."', async () => {
        const courseId = await courseWithSeats(10);
        const cpf = nextCpf();
        const res = await raceAgainstOpenTransaction(
            tx => tx.userData.create({ data: { name: 'CPF DA CORRIDA',
phone: '44991239999',
cpf } }),
            () => full(courseId, { name: 'OUTRA PESSOA',
phone: PHONE,
cpf }),
        );
        expect(res.statusCode, res.body).toBe(409);
        expect(JSON.parse(res.body).error).toBe('CPF já cadastrado para outra pessoa.');
        expect(await prisma.courseUserRegistration.count({ where: { courseId } })).toBe(0);
        expect(await prisma.userData.count({ where: { cpf } })).toBe(1);
    });

    it('inscrição repetida em sequência continua "já está inscrita"', async () => {
        const courseId = await courseWithSeats(10);
        const cpf = nextCpf();
        const first = await full(courseId, { name: 'REPETE SEQUENCIA',
phone: PHONE,
cpf });
        expect(first.statusCode, first.body).toBe(201);
        const again = await full(courseId, { name: 'REPETE SEQUENCIA',
phone: PHONE,
cpf });
        expect(again.statusCode, again.body).toBe(409);
        expect(JSON.parse(again.body).error).toBe('Esta pessoa já está inscrita neste curso.');
    });
});

describe('register-by-cpf e inscrição pela equipe: só há um índice, o da inscrição', () => {
    it('register-by-cpf → "já está inscrita"', async () => {
        const courseId = await courseWithSeats(10);
        const p = await person('BY CPF NA CORRIDA');
        const res = await raceAgainstOpenTransaction(
            tx => tx.courseUserRegistration.create({ data: { courseId,
userDataId: p.id } }),
            () => app.inject({ method: 'POST',
url: `/courses/${courseId}/register-by-cpf`,
payload: { cpf: p.cpf,
phoneEnd: '0000' } }),
        );
        expect(res.statusCode, res.body).toBe(409);
        expect(JSON.parse(res.body).error).toBe('Esta pessoa já está inscrita neste curso.');
        expect(await prisma.courseUserRegistration.count({ where: { courseId } })).toBe(1);
    });

    it('inscrição pela equipe → "Pessoa já inscrita neste curso"', async () => {
        const courseId = await courseWithSeats(10);
        const p = await person('EQUIPE NA CORRIDA');
        const res = await raceAgainstOpenTransaction(
            tx => tx.courseUserRegistration.create({ data: { courseId,
userDataId: p.id } }),
            () => app.inject({ method: 'POST',
url: `/admin/courses/${courseId}/registrations`,
headers: bearer(token),
payload: { userDataId: p.id } }),
        );
        expect(res.statusCode, res.body).toBe(409);
        expect(JSON.parse(res.body).error).toBe('Pessoa já inscrita neste curso');
        expect(await prisma.courseUserRegistration.count({ where: { courseId } })).toBe(1);
    });
});

describe('POST /admin/users: a mensagem segue o índice violado', () => {
    const createAdmin = (userDataId: string, username: string) =>
        app.inject({
            method: 'POST',
            url: '/admin/users',
            headers: bearer(token),
            payload: { username,
password: 'senhaSegura123',
userDataId,
userRole: ruleId },
        });

    it('mesma pessoa virando administradora ao mesmo tempo → "já tem conta de administrador"', async () => {
        const p = await person('ADMIN DUAS VEZES');
        const res = await raceAgainstOpenTransaction(
            tx => tx.userAdmin.create({ data: { username: 'admin-corrida-um',
passwordHash: 'x',
userDataId: p.id,
rulesId: ruleId } }),
            () => createAdmin(p.id, 'admin-corrida-dois'),
        );
        expect(res.statusCode, res.body).toBe(409);
        expect(JSON.parse(res.body).error).toBe('This user already has an admin account');
        expect(await prisma.userAdmin.count({ where: { userDataId: p.id } })).toBe(1);
    });

    it('mesmo usuário escolhido ao mesmo tempo por outra pessoa → "Username already exists"', async () => {
        const a = await person('ADMIN USUARIO IGUAL UM');
        const b = await person('ADMIN USUARIO IGUAL DOIS');
        const res = await raceAgainstOpenTransaction(
            tx => tx.userAdmin.create({ data: { username: 'usuario-corrida',
passwordHash: 'x',
userDataId: a.id,
rulesId: ruleId } }),
            () => createAdmin(b.id, 'usuario-corrida'),
        );
        expect(res.statusCode, res.body).toBe(409);
        expect(JSON.parse(res.body).error).toBe('Username already exists');
        expect(await prisma.userAdmin.count({ where: { userDataId: b.id } })).toBe(0);
    });
});
