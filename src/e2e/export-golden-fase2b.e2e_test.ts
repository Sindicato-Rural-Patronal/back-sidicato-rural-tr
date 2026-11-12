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

describe('teste de ouro pelo banco: CSV dos lançamentos (GET /admin/finance/transactions/export)', () => {
    const header = [
        'Nº', 'Data', 'Tipo', 'Caixa', 'Categoria', 'Descrição', 'Nome / Razão social', 'CNPJ / CPF', 'Nº anterior', 'Método',
        'Recorrente', 'Valor (R$)', 'Observações',
    ];
    const ids: Record<string, string> = {};

    beforeAll(async () => {
        // O `cleanDatabase` não limpa o Financeiro.
        await prisma.$executeRawUnsafe(`
            TRUNCATE TABLE
                "FinanceMonthlyClosing", "FinancialAttachment", "FinancialTransaction",
                "FinanceRecurringTransaction", "FinancialCategory", "FinancialAccount", "FinancePaymentMethod"
            RESTART IDENTITY CASCADE
        `);
        const insumos = await prisma.financialCategory.create({ data: { name: 'INSUMOS',
type: 'OUT' } });
        const mensalidades = await prisma.financialCategory.create({ data: { name: 'MENSALIDADES',
type: 'IN' } });
        const banco = await prisma.financialAccount.create({ data: { name: 'BANCO' } });
        const caixa = await prisma.financialAccount.create({ data: { name: 'CAIXA' } });
        const recorrencia = await prisma.financeRecurringTransaction.create({
            data: { type: 'IN',
description: 'MENSALIDADE',
amountCents: 5,
dayOfMonth: 31,
startMonth: '2026-01' },
        });
        const t = (data: Record<string, unknown>) => prisma.financialTransaction.create({ data: data as never });

        await t({
            number: 128,
            type: 'OUT',
            amountCents: 1234567,
            date: d('2026-05-10T00:00:00.000Z'),
            description: 'Compra de adubo; "NPK"',
            method: 'PIX',
            notes: '=SOMA(A1)',
            categoryId: insumos.id,
            accountId: banco.id,
            empenho: { razaoSocial: ' COOP LTDA ',
nomeFantasia: 'COOP',
cnpjCpf: '12.345.678/0001-90',
numero: ' 0045 ' },
            createdAt: d('2026-05-10T12:00:00.000Z'),
        });
        // Mesmo dia, gravado depois: vem antes na ordem por data.
        await t({
            number: 129,
            type: 'OUT',
            amountCents: 2500,
            date: d('2026-05-10T00:00:00.000Z'),
            description: 'Frete',
            method: 'Pix',
            categoryId: insumos.id,
            accountId: banco.id,
            createdAt: d('2026-05-10T15:00:00.000Z'),
        });
        await t({
            number: 7,
            type: 'IN',
            amountCents: 5,
            date: d('2026-01-31T00:00:00.000Z'),
            description: 'Mensalidade',
            categoryId: mensalidades.id,
            accountId: caixa.id,
            recurringId: recorrencia.id,
            recurringMonth: '2026-01',
            empenho: { nomeFantasia: 'MECANICA DO ZE',
cnpjCpf: '52998224725' },
            createdAt: d('2026-01-31T12:00:00.000Z'),
        });
        // "Só nota", sem número.
        await t({
            amountCents: 100000,
            date: d('2026-03-15T00:00:00.000Z'),
            description: '-desconto',
            method: 'Cheque',
            accountId: caixa.id,
            createdAt: d('2026-03-15T12:00:00.000Z'),
        });
        // Excluído não sai.
        await t({
            number: 300,
            type: 'OUT',
            amountCents: 1,
            date: d('2026-04-01T00:00:00.000Z'),
            description: 'Excluído',
            isDeleted: true,
            deletedAt: d('2026-04-02T00:00:00.000Z'),
        });
        Object.assign(ids, { insumos: insumos.id,
caixa: caixa.id });
    });

    const frete = ['129', '10/05/2026', 'Saída', 'BANCO', 'INSUMOS', 'Frete', '', '', '', 'Pix', 'Não', '25,00', ''];
    const adubo = [
        '128', '10/05/2026', 'Saída', 'BANCO', 'INSUMOS', 'Compra de adubo; ""NPK""', 'COOP LTDA', '12.345.678/0001-90', '0045',
        'PIX', 'Não', '12.345,67', `'=SOMA(A1)`,
    ];
    const nota = ['', '15/03/2026', 'Nota', 'CAIXA', '', `'-desconto`, '', '', '', 'Cheque', 'Não', '1.000,00', ''];
    const mensalidade = [
        '7', '31/01/2026', 'Entrada', 'CAIXA', 'MENSALIDADES', 'Mensalidade', 'MECANICA DO ZE', '52998224725', '', '', 'Sim', '0,05', '',
    ];

    const csv = (query = '') => get(`/admin/finance/transactions/export${query}`);

    it('o CSV inteiro, da data mais nova para a mais antiga, com o nome de arquivo de sempre', async () => {
        const res = await csv();
        expect(res.statusCode, res.body).toBe(200);
        expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
        expect(res.headers['content-disposition']).toBe('attachment; filename="lancamentos.csv"');
        expect(res.body).toBe(file(header, frete, adubo, nota, mensalidade));
    });

    it('ordem pelo Nº (sem número por último)', async () => {
        expect((await csv('?orderBy=number')).body).toBe(file(header, frete, adubo, mensalidade, nota));
    });

    it('filtros da tela: período (até o fim do dia), tipo, categoria, caixa, método e busca', async () => {
        expect((await csv('?from=2026-03-01&to=2026-05-10')).body).toBe(file(header, frete, adubo, nota));
        expect((await csv('?type=IN')).body).toBe(file(header, mensalidade));
        expect((await csv(`?categoryId=${ids.insumos}`)).body).toBe(file(header, frete, adubo));
        expect((await csv(`?accountId=${ids.caixa}`)).body).toBe(file(header, nota, mensalidade));
        expect((await csv('?method=pix')).body).toBe(file(header, frete, adubo));
        expect((await csv('?search=coop')).body).toBe(file(header, adubo));
        expect((await csv('?search=45')).body).toBe(file(header, adubo));
        expect((await csv('?search=128')).body).toBe(file(header, adubo));
        expect((await csv('?search=529.982.247-25')).body).toBe(file(header, mensalidade));
    });

    it('filtro inválido → 400: o schema da rota barra tipo e ordem; o resto, "Parâmetro inválido: <campo>"', async () => {
        for (const [query, error] of [
            ['?from=ontem', 'Parâmetro inválido: from'],
            ['?to=0000-01-01', 'Parâmetro inválido: to'],
            [`?categoryId=${encodeURIComponent('não-é-uuid')}`, 'Parâmetro inválido: categoryId'],
            ['?type=NOTA', 'Valor não aceito em "type".'],
            ['?orderBy=valor', 'Valor não aceito em "orderBy".'],
        ]) {
            const res = await csv(query);
            expect(res.statusCode, query).toBe(400);
            expect(res.json(), query).toEqual({ error });
        }
    });
});

describe('teste de ouro pelo banco: relatório de cadastros', () => {
    // As seções de pessoas são o padrão de `people` (teste de ouro da fase 1):
    // aqui elas são comparadas com a exportação de pessoas, e as de empresas e
    // administradores, célula por célula.
    const companiesHeader = [
        'Razão social', 'Nome fantasia', 'CNPJ', 'Inscrição estadual', 'Tipo', 'E-mail', 'Telefone', 'Telefone 2',
        'Telefone 3', 'Site', ...['Tipo', 'Rua', 'Número', 'Complemento', 'Bairro', 'Localidade', 'Estrada', 'Km', 'Lote', 'Seção', 'Cidade', 'UF', 'CEP'].map(h => `Sede: ${h}`),
        'Pessoas vinculadas', 'Propriedades', 'Parceira', 'Link da parceria', 'Observações', 'Cadastrada em', 'Atualizada em',
    ];
    const adminsHeader = ['Usuário', 'Nome', 'E-mail', 'CPF', 'Telefone', 'Regra de acesso', 'Criado em'];

    beforeAll(async () => {
        const maria = await prisma.userData.create({
            data: { name: 'MARIA CADASTRO',
phone: '44911119200',
memberStatus: 'ACTIVE' },
        });
        const sede = await prisma.address.create({
            data: {
                type: 'URBAN',
                street: 'RUA X',
                number: '10',
                complement: 'SALA 2; FUNDOS',
                neighborhood: 'CENTRO',
                city: 'TERRA ROXA',
                state: 'PR',
                zipCode: '85990000',
            },
        });
        const rural = await prisma.address.create({
            data: {
                type: 'RURAL',
                localityName: 'AGUA DO SOL',
                road: 'ESTRADA BOIADEIRA',
                km: '12',
                lot: '7',
                section: 'B',
                city: 'TERRA ROXA',
                state: 'PR',
                zipCode: '85990000',
            },
        });
        const agro = await prisma.company.create({
            data: {
                name: 'AGRO "CADASTRO" LTDA',
                tradeName: 'AGRO CADASTRO',
                cnpj: '11222333000181',
                stateRegistration: 'ISENTO',
                type: 'PRIVATE',
                email: 'agro@cad.test',
                phone: '4436451234',
                phone2: '(44) 99999-0000',
                phone3: '+55 44 3333-2222',
                website: 'https://agro.cad.test',
                notes: '=HYPERLINK("x")',
                isPartner: true,
                partnerUrl: 'https://agro.cad.test/parceria',
                addressId: sede.id,
            },
        });
        const coop = await prisma.company.create({ data: { name: 'COOP CADASTRO VAZIA',
type: 'PUBLIC' } });
        // Empresa excluída não sai.
        await prisma.company.create({ data: { name: 'EXCLUIDA CADASTRO',
isDeleted: true,
deletedAt: d('2026-01-01T00:00:00.000Z') } });
        await prisma.companyMember.create({ data: { companyId: agro.id,
userDataId: maria.id,
title: 'GERENTE' } });
        await prisma.property.create({ data: { name: 'FAZENDA CADASTRO',
registration: '5',
companyId: agro.id,
addressId: rural.id } });
        await prisma.$executeRaw`UPDATE "Company" SET "createdAt" = ${d('2026-01-02T15:30:00.000Z')}, "updatedAt" = ${d('2026-03-04T02:05:00.000Z')} WHERE id = ${agro.id}`;
        await prisma.$executeRaw`UPDATE "Company" SET "createdAt" = ${d('2026-09-16T23:30:00.000Z')}, "updatedAt" = ${d('2026-09-16T23:30:00.000Z')} WHERE id = ${coop.id}`;

        // Administradores: os dois de antes (o do E2E e o da auditoria) e dois novos.
        const rule = await prisma.rule.create({ data: { name: 'CADASTRO; LEITURA',
description: 'x',
permissions: ['READ_COURSE'] } });
        const ana = await prisma.userData.create({
            data: { name: 'ANA CADASTRO',
email: 'ana@cad.test',
cpf: '11144477735',
phone: '44911119201' },
        });
        const bia = await prisma.userData.create({ data: { name: 'BIA "CADASTRO"',
phone: '+55 44 9999' } });
        const dora = await prisma.userData.create({ data: { name: 'DORA CADASTRO',
phone: '44911119203' } });
        await prisma.userAdmin.create({ data: { username: 'ana.cadastro',
passwordHash: 'x',
userDataId: ana.id,
rulesId: rule.id } });
        await prisma.userAdmin.create({ data: { username: '=bia',
passwordHash: 'x',
userDataId: bia.id,
rulesId: rule.id } });
        // Administrador excluído não sai.
        await prisma.userAdmin.create({
            data: { username: 'dora.cadastro',
passwordHash: 'x',
userDataId: dora.id,
rulesId: rule.id,
isDeleted: true },
        });
        await prisma.$executeRaw`UPDATE "UserAdmin" SET "createdAt" = ${d('2026-02-01T10:00:00.000Z')}`;
        await prisma.$executeRaw`UPDATE "UserAdmin" SET "createdAt" = ${d('2026-09-16T23:30:00.000Z')} WHERE username = '=bia'`;
    });

    const agroRow = [
        'AGRO ""CADASTRO"" LTDA', 'AGRO CADASTRO', '11.222.333/0001-81', 'ISENTO', 'Privada', 'agro@cad.test', '4436451234',
        '(44) 99999-0000', `'+55 44 3333-2222`, 'https://agro.cad.test',
        'Urbano', 'RUA X', '10', 'SALA 2; FUNDOS', 'CENTRO', '', '', '', '', '', 'TERRA ROXA', 'PR', '85990-000',
        'MARIA CADASTRO (GERENTE)',
        'FAZENDA CADASTRO (matrícula 5): ESTRADA BOIADEIRA - AGUA DO SOL, km 12, lote 7, seção B - TERRA ROXA/PR - 85990-000',
        'Sim', 'https://agro.cad.test/parceria', `'=HYPERLINK(""x"")`, '02/01/2026 12:30', '03/03/2026 23:05',
    ];
    const coopRow = [
        'COOP CADASTRO VAZIA', '', '', '', 'Pública', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '',
        '', '', 'Não', '', '', '16/09/2026 20:30', '16/09/2026 20:30',
    ];
    const admins = [
        ['ana.cadastro', 'ANA CADASTRO', 'ana@cad.test', '111.444.777-35', '44911119201', 'CADASTRO; LEITURA', '01/02/2026 07:00'],
        ['bali.ouro', 'BALI OURO', '', '', '44911119001', 'OURO AUDITORIA', '01/02/2026 07:00'],
        [`'=bia`, 'BIA ""CADASTRO""', '', '', `'+55 44 9999`, 'CADASTRO; LEITURA', '16/09/2026 20:30'],
        ['e2eadmin', 'E2E Admin', 'e2eadmin@test.local', '', '44900000000', 'SUPER_RULE', '01/02/2026 07:00'],
    ];

    it('as quatro seções num arquivo, byte a byte', async () => {
        const pessoas = await get('/admin/export/people');
        const associados = await get('/admin/export/people?activeMember=true');
        expect(pessoas.statusCode).toBe(200);
        // A associada em dia sai nas duas seções de pessoas.
        expect(associados.body).toContain('"MARIA CADASTRO"');
        const pessoasCount = Number(pessoas.headers['x-export-count']);
        const associadosCount = Number(associados.headers['x-export-count']);
        const semBom = (body: string) => body.replace(BOM, '');

        const res = await get('/admin/export/cadastros');
        expect(res.statusCode, res.body.slice(0, 200)).toBe(200);
        expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
        expect(res.headers['content-disposition']).toBe(`attachment; filename="relatorio-de-cadastros-${todayBr()}.csv"`);
        expect(res.headers['x-export-count']).toBe(String(pessoasCount + associadosCount + 2 + 4));
        expect(res.body).toBe(
            BOM
                + line(['PESSOAS FISICAS']) + semBom(pessoas.body)
                + '\r\n'
                + line(['ASSOCIADOS EM DIA']) + semBom(associados.body)
                + '\r\n'
                + line(['PESSOAS JURIDICAS']) + line(companiesHeader) + line(agroRow) + line(coopRow)
                + '\r\n'
                + line(['ADMINISTRADORES']) + line(adminsHeader) + admins.map(line).join(''),
        );
    });

    it('sem montador: catálogo 404, fields e PDF 400; a auditoria grava a linha de sempre, sem detalhes', async () => {
        expect((await get('/admin/export/cadastros/catalog')).statusCode).toBe(404);
        for (const query of ['fields=name', 'format=pdf']) {
            const res = await get(`/admin/export/cadastros?${query}`);
            expect(res.statusCode).toBe(400);
            expect(res.json()).toEqual({ error: 'Este conjunto ainda não tem o montador.' });
        }
        await get('/admin/export/cadastros');
        const log = await prisma.auditLog.findFirst({ where: { method: 'EXPORT',
path: '/admin/export/cadastros' },
orderBy: { createdAt: 'desc' } });
        expect(log!.targetLabel).toMatch(/^Relatório de cadastros: \d+ registros \(todos\)$/);
        expect(log!.details).toBeNull();
    });
});
