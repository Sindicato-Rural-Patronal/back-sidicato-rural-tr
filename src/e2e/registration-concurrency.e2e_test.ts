import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '../generated/prisma/client.js';
import { createTestApp } from './helpers/create-test-app.js';
import { createTestPrisma, cleanDatabase } from './helpers/db.js';

// Vagas com inscrições chegando ao mesmo tempo, contra o Postgres de verdade:
// `register` e `register-by-cpf` contam e inserem numa transação Serializable
// (`RegistrationAdapter.createWithCapacity`). O `register-full` tem caminho
// próprio e fica para quando a SR-016 terminar.

let app: FastifyInstance;
let prisma: PrismaClient;
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
const nextCpf = () => cpfFrom(String(300000000 + ++seq * 7919).slice(0, 9));

async function courseWithSeats(seats: number) {
    seq += 1;
    const room = await prisma.room.create({ data: { name: `SALA CONCORRENCIA ${seq}`,
description: 'x',
maxCapacity: seats } });
    return prisma.course.create({
        data: {
            name: `CURSO CONCORRENCIA ${seq}`,
            description: 'x',
            roomId: room.id,
            status: 'PUBLIC',
            startTime: new Date('2032-07-10T08:00:00Z'),
            endTime: new Date('2032-07-12T17:00:00Z'),
        },
    });
}

type Rota = 'register' | 'register-by-cpf';

/** Dispara `requests` inscrições ao mesmo tempo num curso de `seats` vagas. */
async function burst(rota: Rota, seats: number, requests: number) {
    const course = await courseWithSeats(seats);
    const cpfs = Array.from({ length: requests }, () => nextCpf());
    if (rota === 'register-by-cpf') {
        await prisma.userData.createMany({ data: cpfs.map((cpf, i) => ({ name: `INSCRITO ${i}`,
phone: '44990000001',
cpf })) });
    }
    const responses = await Promise.all(
        cpfs.map((cpf, i) =>
            app.inject({
                method: 'POST',
                url: `/courses/${course.id}/${rota}`,
                payload: rota === 'register' ? { name: `INSCRITO ${i}`,
phone: '44990000001',
cpf } : { cpf,
phoneEnd: '0001' },
            }),
        ),
    );
    const active = await prisma.courseUserRegistration.count({ where: { courseId: course.id,
isDeleted: false } });
    const statuses = responses.map(r => r.statusCode).sort((a, b) => a - b);
    return { responses,
statuses,
active };
}

beforeAll(async () => {
    prisma = createTestPrisma();
    await cleanDatabase(prisma);
    app = await createTestApp(prisma);
});

afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
});

describe.each<Rota>(['register', 'register-by-cpf'])('POST /courses/:id/%s ao mesmo tempo', rota => {
    it('nunca passa da lotação: 8 pedidos para 3 vagas', async () => {
        const { responses, active } = await burst(rota, 3, 8);
        expect(active).toBeLessThanOrEqual(3);
        expect(responses.filter(r => r.statusCode === 201)).toHaveLength(active);
    });

    // BUG (SR-017): com o driver adapter do Prisma 7 o conflito de serialização
    // chega como DriverAdapterError, sem `code`, com cause.kind
    // 'TransactionWriteConflict' (originalCode 40001). O
    // `isPrismaSerializationError` só reconhece `code === 'P2034'`, então o retry
    // do `createWithCapacity` nunca roda e quem perde a corrida leva 500, com vaga
    // sobrando. Medido: 6 pedidos para 5 vagas → só 1 a 4 entram, o resto 500.
    // Quando a correção entrar, este teste quebra: troque `it.fails` por `it`.
    it('N+1 pedidos para N vagas: N entram, 1 ouve "lotado", ninguém leva 500', async () => {
        const { statuses, active } = await burst(rota, 5, 6);
        expect(statuses).toEqual([201, 201, 201, 201, 201, 409]);
        expect(active).toBe(5);
    });
});
