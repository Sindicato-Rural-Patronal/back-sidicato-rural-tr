import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '../generated/prisma/client.js';
import { createTestApp } from './helpers/create-test-app.js';
import { createTestPrisma, cleanDatabase, seedSuperAdmin, loginAndGetToken, bearer } from './helpers/db.js';

// Teste de ouro pelo banco da fase 2, parte B (decisão 006, item 8; SR-102): o
// CSV padrão de cada fonte que ainda sai pelo caminho antigo, byte a byte, a
// partir de dados gravados de verdade. Cobre o que o unitário não cobre: o que
// o adapter lê (relações, ordem, filtros de exclusão, limite de linhas). Cada
// bloco foi escrito ANTES de a fonte dele sair do caminho antigo.
//
// Só a data no nome do arquivo depende do dia em que o teste roda.

let app: FastifyInstance;
let prisma: PrismaClient;
let token: string;

const BOM = '﻿';
const line = (cells: string[]) => `${cells.map(c => `"${c}"`).join(';')}\r\n`;
const file = (...lines: string[][]) => BOM + lines.map(line).join('');

/** AAAA-MM-DD de hoje em Brasília. */
const todayBr = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

const d = (iso: string) => new Date(iso);

beforeAll(async () => {
    prisma = createTestPrisma();
    await cleanDatabase(prisma);
    // O `cleanDatabase` não limpa a trilha: as linhas de outros arquivos atrapalhariam.
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "AuditLog"');
    await seedSuperAdmin(prisma);
    app = await createTestApp(prisma);
    token = await loginAndGetToken(app);
});

afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
});

const get = (url: string) => app.inject({ method: 'GET',
url,
headers: bearer(token) });

describe('teste de ouro pelo banco: auditoria', () => {
    const header = ['Data e hora', 'Quem', 'Ação', 'Área', 'Alvo', 'Caminho', 'IP', 'Local', 'Aparelho', 'Alterações'];
    const ids: Record<string, string> = {};

    beforeAll(async () => {
        const rule = await prisma.rule.create({ data: { name: 'OURO AUDITORIA',
description: 'x',
permissions: ['READ_AUDIT'] } });
        const pessoa = await prisma.userData.create({ data: { name: 'BALI OURO',
phone: '44911119001' } });
        const bali = await prisma.userAdmin.create({
            data: { username: 'bali.ouro',
passwordHash: 'x',
userDataId: pessoa.id,
rulesId: rule.id },
        });
        ids.bali = bali.id;

        const base = { statusCode: 200,
ip: null,
userAgent: null,
location: null };
        await prisma.auditLog.createMany({
            data: [
                // Fora do período: 30/12/2025 23:59 em Brasília.
                { ...base,
actorId: bali.id,
method: 'POST',
path: '/rooms',
entity: 'Sala',
targetLabel: 'FORA',
createdAt: d('2025-12-31T02:59:00.000Z') },
                // No limite do período: 31/01/2026 23:59 em Brasília.
                {
                    ...base,
                    actorId: bali.id,
                    method: 'EXPORT',
                    path: '/admin/export/people',
                    entity: 'Exportação',
                    targetLabel: 'Pessoas: 2 registros (todos) · CSV',
                    ip: '200.1.2.3',
                    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
                    location: 'Terra Roxa, PR, Brasil',
                    details: { formato: 'csv',
modelo: null,
campos: ['Nome'],
escopo: 'todos',
filtros: [],
linhas: 2 },
                    createdAt: d('2026-02-01T02:59:00.000Z'),
                },
                {
                    ...base,
                    actorId: bali.id,
                    method: 'EXPORT',
                    path: '/admin/export/people',
                    entity: 'Exportação',
                    targetLabel: 'Pessoas: 3 registros (com filtros) · PDF · com CPF',
                    ip: '200.1.2.3',
                    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
                    location: 'Terra Roxa, PR, Brasil',
                    details: {
                        formato: 'pdf',
                        modelo: 'Nome e CPF',
                        campos: ['Nome', 'CPF'],
                        escopo: 'com filtros',
                        filtros: [{ nome: 'Busca',
valor: 'silva' }],
                        linhas: 3,
                    },
                    createdAt: d('2026-01-20T13:00:00.000Z'),
                },
                // Sem quem: tentativa de login pelo site.
                {
                    ...base,
                    actorId: null,
                    method: 'LOGIN_FAILED',
                    path: '/auth/login',
                    entity: 'Login',
                    targetLabel: '(usuário inexistente)',
                    ip: '177.10.20.30',
                    userAgent: 'curl/8.4.0',
                    location: 'Toledo, PR, Brasil',
                    statusCode: 401,
                    createdAt: d('2026-01-15T02:30:00.000Z'),
                },
                // Quem fez não existe mais: "—". Alvo com aspas e fórmula; alterações.
                {
                    ...base,
                    actorId: 'administrador-que-sumiu',
                    method: 'PATCH',
                    path: '/users/0b9f6a52-4d0f-4c1e-9d55-6b5f3c2a1e10',
                    entity: 'Usuário',
                    targetLabel: '=JOÃO "J"',
                    ip: '10.0.0.9',
                    changes: [
                        { field: 'email',
before: 'a@x.com',
after: null },
                        { field: 'phone',
before: '44999990000',
after: '44988880000' },
                    ],
                    createdAt: d('2026-01-10T12:00:00.000Z'),
                },
            ],
        });
    });

    const limite = [
        '31/01/2026 23:59', 'bali.ouro', 'Exportou uma planilha', 'Exportação', 'Pessoas: 2 registros (todos) · CSV',
        '/admin/export/people', '200.1.2.3', 'Terra Roxa, PR, Brasil', 'Chrome no Windows', '',
    ];
    const pdf = [
        '20/01/2026 10:00', 'bali.ouro', 'Exportou um relatório em PDF', 'Exportação',
        'Pessoas: 3 registros (com filtros) · PDF · com CPF', '/admin/export/people', '200.1.2.3', 'Terra Roxa, PR, Brasil',
        'Safari no iPhone', '',
    ];
    const login = [
        '14/01/2026 23:30', 'Público', 'Tentativa de login falhou', 'Login', '(usuário inexistente)', '/auth/login',
        '177.10.20.30', 'Toledo, PR, Brasil', 'curl', '',
    ];
    const edicao = [
        '10/01/2026 09:00', '—', 'Editou um usuário', 'Usuário', `'=JOÃO ""J""`, '/users/0b9f6a52-4d0f-4c1e-9d55-6b5f3c2a1e10',
        '10.0.0.9', '', '', 'E-mail: a@x.com → (vazio); Telefone: 44999990000 → 44988880000',
    ];

    it('o CSV padrão inteiro, pelo período (dias de Brasília), do mais recente para o mais antigo', async () => {
        const res = await get('/admin/export/audit-logs?from=2026-01-01&to=2026-01-31');
        expect(res.statusCode, res.body).toBe(200);
        expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
        expect(res.headers['content-disposition']).toBe(`attachment; filename="auditoria-${todayBr()}.csv"`);
        expect(res.headers['x-export-count']).toBe('4');
        expect(res.body).toBe(file(header, limite, pdf, login, edicao));
    });

    it('filtros da tela: ação, área, quem, IP e busca', async () => {
        const period = 'from=2026-01-01&to=2026-01-31';
        expect((await get(`/admin/export/audit-logs?${period}&action=export`)).body).toBe(file(header, limite, pdf));
        expect((await get(`/admin/export/audit-logs?${period}&action=login_failed`)).body).toBe(file(header, login));
        expect((await get(`/admin/export/audit-logs?${period}&action=edit`)).body).toBe(file(header, edicao));
        expect((await get(`/admin/export/audit-logs?${period}&entity=Login`)).body).toBe(file(header, login));
        expect((await get(`/admin/export/audit-logs?${period}&actorId=${ids.bali}`)).body).toBe(file(header, limite, pdf));
        expect((await get(`/admin/export/audit-logs?${period}&ip=10.0.0.9`)).body).toBe(file(header, edicao));
        expect((await get(`/admin/export/audit-logs?${period}&q=${encodeURIComponent('com filtros')}`)).body).toBe(file(header, pdf));
        expect((await get(`/admin/export/audit-logs?${period}&q=${encodeURIComponent('/users/')}`)).body).toBe(file(header, edicao));
    });

    it('no máximo 20.000 linhas: saem as mais recentes, sem erro', async () => {
        const total = 20_001;
        const start = d('2024-01-01T12:00:00.000Z').getTime();
        const rows = Array.from({ length: total }, (_, i) => ({
            actorId: null,
            method: 'POST',
            path: '/rooms',
            entity: 'Sala',
            targetLabel: `LOTE ${String(i).padStart(5, '0')}`,
            statusCode: 201,
            // Um minuto entre uma e outra: a de índice maior é a mais recente.
            createdAt: new Date(start + i * 60_000),
        }));
        for (let i = 0; i < rows.length; i += 2000) {
            await prisma.auditLog.createMany({ data: rows.slice(i, i + 2000) });
        }

        const res = await get('/admin/export/audit-logs?from=2024-01-01&to=2024-12-31');
        expect(res.statusCode, res.body.slice(0, 200)).toBe(200);
        expect(res.headers['x-export-count']).toBe('20000');
        const lines = res.body.replace(BOM, '').split('\r\n').filter(Boolean);
        expect(lines).toHaveLength(20_001);
        expect(lines[0]).toBe(line(header).trimEnd());
        expect(lines[1]).toContain('"LOTE 20000"');
        expect(lines[20_000]).toContain('"LOTE 00001"');
        expect(res.body).not.toContain('"LOTE 00000"');
    }, 60_000);
});

describe('teste de ouro pelo banco: reservas de sala', () => {
    const header = ['Tipo', 'Título', 'Sala', 'Início', 'Término', 'Responsável', 'Descrição', 'Série'];
    const ids: Record<string, string> = {};

    beforeAll(async () => {
        const auditorio = await prisma.room.create({ data: { name: 'AUDITORIO OURO',
description: 'x',
maxCapacity: 80 } });
        const sala = await prisma.room.create({ data: { name: 'SALA OURO',
description: 'x',
maxCapacity: 20 } });
        const joao = await prisma.userData.create({ data: { name: 'JOÃO RESERVA',
phone: '44911119100' } });
        const booking = (data: Record<string, unknown>) => prisma.roomBooking.create({ data: data as never });

        const palestra = await booking({
            type: 'EVENT',
            title: 'Palestra "Solo"; manejo',
            description: 'Trazer projetor',
            publicOnSite: true,
            publicDescription: 'Aberta ao público',
            roomId: auditorio.id,
            startTime: d('2026-10-05T08:00:00.000Z'),
            endTime: d('2026-10-05T12:00:00.000Z'),
            responsibleUserDataId: joao.id,
            responsibleName: 'NOME DIGITADO ANTES',
            seriesId: 'serie-ouro',
        });
        // A mesma série na semana seguinte: fora do período.
        await booking({
            type: 'EVENT',
            title: 'Palestra "Solo"; manejo',
            roomId: auditorio.id,
            startTime: d('2026-10-12T08:00:00.000Z'),
            endTime: d('2026-10-12T12:00:00.000Z'),
            responsibleUserDataId: joao.id,
            seriesId: 'serie-ouro',
        });
        // Mesmo início da palestra: desempata pelo título.
        await booking({
            type: 'MEETING',
            title: 'Almoço da equipe',
            roomId: sala.id,
            startTime: d('2026-10-05T08:00:00.000Z'),
            endTime: d('2026-10-05T09:00:00.000Z'),
        });
        await booking({
            type: 'MEETING',
            title: '=Reunião da diretoria',
            description: '-pauta: contas',
            roomId: sala.id,
            startTime: d('2026-10-06T19:30:00.000Z'),
            endTime: d('2026-10-06T21:00:00.000Z'),
            responsibleName: 'FORNECEDOR X',
        });
        // Começa antes do período e termina dentro dele: sai.
        await booking({
            type: 'EVENT',
            title: 'Plantão',
            roomId: sala.id,
            startTime: d('2026-10-04T23:00:00.000Z'),
            endTime: d('2026-10-05T01:30:00.000Z'),
        });
        // Reserva excluída não sai.
        await booking({
            type: 'EVENT',
            title: 'Cancelada',
            roomId: sala.id,
            startTime: d('2026-10-07T08:00:00.000Z'),
            endTime: d('2026-10-07T09:00:00.000Z'),
            isDeleted: true,
            deletedAt: d('2026-09-01T00:00:00.000Z'),
        });
        Object.assign(ids, { palestra: palestra.id,
sala: sala.id });
    });

    const plantao = ['Evento', 'Plantão', 'SALA OURO', '04/10/2026 23:00', '05/10/2026 01:30', '', '', 'Não'];
    const almoco = ['Reunião', 'Almoço da equipe', 'SALA OURO', '05/10/2026 08:00', '05/10/2026 09:00', '', '', 'Não'];
    const palestra = [
        'Evento', 'Palestra ""Solo""; manejo', 'AUDITORIO OURO', '05/10/2026 08:00', '05/10/2026 12:00', 'JOÃO RESERVA',
        'Trazer projetor', 'Sim',
    ];
    const reuniao = [
        'Reunião', `'=Reunião da diretoria`, 'SALA OURO', '06/10/2026 19:30', '06/10/2026 21:00', 'FORNECEDOR X',
        `'-pauta: contas`, 'Não',
    ];

    it('o CSV padrão inteiro, pelo período, na ordem do início e do título', async () => {
        const res = await get('/admin/export/room-bookings?from=2026-10-05&to=2026-10-11');
        expect(res.statusCode, res.body).toBe(200);
        expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
        expect(res.headers['content-disposition']).toBe(`attachment; filename="reservas-de-sala-${todayBr()}.csv"`);
        expect(res.headers['x-export-count']).toBe('4');
        expect(res.body).toBe(file(header, plantao, almoco, palestra, reuniao));
    });

    it('filtros da Agenda: sala, tipo e busca (título sem acento, responsável)', async () => {
        const period = 'from=2026-10-05&to=2026-10-11';
        expect((await get(`/admin/export/room-bookings?${period}&roomId=${ids.sala}`)).body).toBe(file(header, plantao, almoco, reuniao));
        expect((await get(`/admin/export/room-bookings?${period}&type=MEETING`)).body).toBe(file(header, almoco, reuniao));
        expect((await get(`/admin/export/room-bookings?${period}&search=reuniao`)).body).toBe(file(header, reuniao));
        expect((await get(`/admin/export/room-bookings?${period}&search=fornecedor`)).body).toBe(file(header, reuniao));
        expect((await get(`/admin/export/room-bookings?${period}&search=${encodeURIComponent('joão')}`)).body).toBe(file(header, palestra));
    });

    it('uma reserva pelo id: o título no nome do arquivo', async () => {
        const res = await get(`/admin/export/room-bookings?ids=${ids.palestra}`);
        expect(res.headers['content-disposition']).toBe(`attachment; filename="reserva-palestra-solo-manejo-${todayBr()}.csv"`);
        expect(res.body).toBe(file(header, palestra));
    });
});
