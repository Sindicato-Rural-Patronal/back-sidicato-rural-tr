import { describe, it, expect, vi, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { ExportDataUseCase } from '../export-data.js';
import { ListFinanceTransactionsUseCase } from '../list-finance-transactions.js';
import { GetExportCatalogUseCase } from '../export/get-export-catalog.js';
import { EXPORT_SOURCES } from '../export/catalog/index.js';
import { financeTransactionsSource } from '../export/catalog/finance-transactions.js';
import { MODELO_E_VISAO_MESSAGE, resolveFields } from '../export/engine.js';
import {
    VISAO_MESSAGES, readVisaoFilters, sourceHasVisoes, visaoFilterKeys, visaoFiltersText,
} from '../export/visoes.js';
import {
    ReportTemplatesUseCase, TEMPLATE_MESSAGES, reportTemplateAuditSnapshot, type TemplateActor,
} from '../export/report-templates.js';
import type { ExportRepository } from '../../ports/external/export-repository.js';
import type { FinanceRepository } from '../../ports/external/finance-repository.js';
import type {
    ReportTemplateModel, ReportTemplateRepository,
} from '../../ports/external/report-template-repository.js';
import { ForbiddenError } from '../../errors/auth.js';
import { ConflictError } from '../../errors/conflict.js';
import { ValidationError } from '../../errors/validation.js';
import { readXlsx } from '../../lib/__tests__/xlsx-reader.js';

// Visões da tela (decisão 007, SR-149): as colunas do catálogo na lista
// (`fields` → `columns` + `cells`), as visões de fábrica, os filtros que uma
// visão guarda, o "Visão:" no arquivo exportado e a auditoria das visões.

const CAT = '11111111-1111-4111-8111-111111111111';
const ACC = '22222222-2222-4222-8222-222222222222';

// 17/09/2026 10:00 em Brasília.
const NOW = new Date('2026-09-17T13:00:00.000Z');

const tx = (over: object) => ({
    id: 'tx',
    number: null,
    type: null,
    amountCents: 0,
    date: new Date('2026-01-01T00:00:00.000Z'),
    description: '',
    method: null,
    notes: null,
    categoryId: null,
    accountId: null,
    transferId: null,
    createdBy: null,
    recurringId: null,
    recurringMonth: null,
    empenho: null,
    isDeleted: false,
    deletedAt: null,
    createdAt: new Date('2026-01-01T12:00:00.000Z'),
    updatedAt: new Date('2026-01-01T12:00:00.000Z'),
    category: null,
    account: null,
    attachments: [],
    ...over,
});

/** Saída com Nota de Empenho, fórmula nas observações, telefone e CEP sem máscara. */
const adubo = tx({
    id: 't1',
    number: 128,
    type: 'OUT',
    amountCents: 1234567,
    date: new Date('2026-05-10T00:00:00.000Z'),
    description: 'Compra de adubo; "NPK"',
    method: 'PIX',
    notes: '=SOMA(A1)',
    category: { name: 'INSUMOS' },
    account: { name: 'BANCO' },
    recurringId: null,
    empenho: {
        razaoSocial: ' COOP LTDA ',
        nomeFantasia: 'COOP',
        cnpjCpf: '12.345.678/0001-90',
        numero: ' 0045 ',
        telefone: '44999998888',
        cep: '85990000',
        descontoCents: 150,
    },
});

/** Entrada recorrente, sem caixa nem categoria. */
const mensalidade = tx({
    id: 't2',
    number: 7,
    type: 'IN',
    amountCents: 5,
    date: new Date('2026-01-31T00:00:00.000Z'),
    description: 'Mensalidade',
    recurringId: 'r1',
    recurringMonth: '2026-01',
    empenho: { nomeFantasia: 'MECANICA DO ZE',
cnpjCpf: '52998224725' },
});

/** "Só nota", sem número; descrição que vira fórmula. */
const nota = tx({
    id: 't3',
    amountCents: 100000,
    date: new Date('2026-03-15T00:00:00.000Z'),
    description: '-desconto',
    method: 'Cheque',
    account: { name: 'CAIXA' },
});

const ROWS = [adubo, nota, mensalidade];

// ── Exportação (mock do repositório) ─────────────────────────────────────────

const exportRepo = {
    financeTransactions: vi.fn(),
    financeNames: vi.fn(),
    logExport: vi.fn(),
} as unknown as ExportRepository;
const exportUseCase = () => new ExportDataUseCase(exportRepo, () => NOW);

async function exportFinance(body: Record<string, unknown>, rows: object[] = ROWS) {
    vi.mocked(exportRepo.financeTransactions).mockResolvedValue(rows as never);
    return exportUseCase().execute('finance-transactions', body);
}

// ── Lista (mock do repositório do Financeiro) ────────────────────────────────

const financeRepo = {
    listTransactions: vi.fn(),
    sumTransactions: vi.fn(),
} as unknown as FinanceRepository;
const listUseCase = () => new ListFinanceTransactionsUseCase(financeRepo, () => NOW);

function giveList(rows: object[], total = rows.length) {
    vi.mocked(financeRepo.listTransactions).mockResolvedValue({ items: rows,
total } as never);
    vi.mocked(financeRepo.sumTransactions).mockResolvedValue([]);
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(exportRepo.financeNames).mockResolvedValue({ category: null,
account: null });
});

const visoes = financeTransactionsSource.visoes!;
const visao = (id: string) => visoes.find(v => v.id === id)!;

describe('visões de fábrica dos Lançamentos', () => {
    it('quatro visões, a primeira é a Padrão (as 8 colunas que a tabela sempre teve)', () => {
        expect(visoes.map(v => [v.id, v.name])).toEqual([
            ['padrao-tela', 'Padrão'],
            ['contabilidade', 'Contabilidade'],
            ['completa', 'Completa (como a planilha de antes)'],
            ['resumida', 'Resumida'],
        ]);
        expect(visao('padrao-tela').fields).toEqual(['number', 'date', 'description', 'payeeName', 'category', 'account', 'method', 'amount']);
        expect(visao('resumida').fields).toEqual(['number', 'date', 'description', 'payeeName', 'amount']);
    });

    it('Contabilidade: as colunas do modelo Contabilidade e os filtros Entradas, sem transferências, mês passado', () => {
        const modelo = financeTransactionsSource.modelos.find(m => m.id === 'contabilidade')!;
        expect(visao('contabilidade').fields).toEqual(modelo.fields);
        expect(visao('contabilidade').filters).toEqual({ type: 'IN',
excludeTransfers: true,
periodo: 'mes-passado' });
        // O modelo do montador continua sem filtrar.
        expect(modelo).not.toHaveProperty('filters');
    });

    it('Completa = as 13 colunas do padrão da planilha', () => {
        expect(visao('completa').fields).toEqual(financeTransactionsSource.padrao);
    });

    it('toda visão usa chaves do catálogo, sem campo de permissão própria, e filtros que passam pela validação', () => {
        for (const v of visoes) {
            const fields = resolveFields(financeTransactionsSource.fields, v.fields);
            expect(fields, v.id).not.toBeInstanceOf(Error);
            expect((fields as { permission?: string }[]).filter(f => f.permission), v.id).toEqual([]);
            // A visão de fábrica tem de ser gravável como visão da equipe, sem mudar.
            expect(readVisaoFilters(financeTransactionsSource, v.filters), v.id).toEqual(v.filters);
        }
    });

    it('só os Lançamentos têm visões: nas outras fontes o catálogo não traz o campo', () => {
        const comVisoes = Object.entries(EXPORT_SOURCES).filter(([, s]) => sourceHasVisoes(s)).map(([d]) => d);
        expect(comVisoes).toEqual(['finance-transactions']);
        const catalog = new GetExportCatalogUseCase();
        expect(catalog.execute('finance-transactions').catalog!.visoes).toEqual(visoes);
        expect(catalog.execute('people').catalog).not.toHaveProperty('visoes');
    });

    it('a visão Completa sai igual, byte a byte, ao CSV sem fields (o ouro dos lançamentos)', async () => {
        const sem = await exportFinance({ orderBy: 'date' });
        const completa = await exportFinance({ orderBy: 'date',
fields: visao('completa').fields,
visao: 'Completa (como a planilha de antes)' });
        expect(sem.error).toBeUndefined();
        expect(completa.error).toBeUndefined();
        expect(completa.result!.csv).toBe(sem.result!.csv);
    });
});

describe('lista com fields: columns e cells', () => {
    const FIELDS = ['ordinal', 'number', 'date', 'type', 'payeeDocument', 'payeePhone', 'payeeZipCode', 'discount', 'recurring', 'notes', 'amount', 'signature'];

    it('sem fields, a página é a de sempre: sem columns nem cells', async () => {
        giveList(ROWS);
        const page = await listUseCase().execute({});
        expect(Object.keys(page).sort()).toEqual(['data', 'limit', 'page', 'total', 'totalPages', 'totals']);
        expect(page.data).toEqual(ROWS);
        expect(page.data[0]).not.toHaveProperty('cells');
    });

    it('com fields: as colunas na ordem pedida, com tipo, largura e privacidade; o lançamento continua inteiro', async () => {
        giveList(ROWS);
        const page = await listUseCase().execute({ fields: 'number,payeeDocument,description,amount' });
        expect(page.columns).toEqual([
            { key: 'number',
label: 'Nº',
type: 'number',
weight: 1,
privacy: 'comum' },
            { key: 'payeeDocument',
label: 'CNPJ / CPF',
type: 'text',
weight: 2,
privacy: 'pessoal' },
            { key: 'description',
label: 'Descrição',
type: 'text',
weight: 4,
privacy: 'comum' },
            { key: 'amount',
label: 'Valor (R$)',
type: 'money',
weight: 1.5,
privacy: 'comum' },
        ]);
        expect(page.data[0]).toMatchObject({ id: 't1',
empenho: adubo.empenho,
cells: ['128', '12.345.678/0001-90', 'Compra de adubo; "NPK"', '12.345,67'] });
        expect(page.data[1].cells).toEqual(['', '', '-desconto', '1.000,00']);
    });

    it('as células são as do PDF da exportação para as mesmas linhas (sem apóstrofo, com máscara, vazio "")', async () => {
        giveList(ROWS);
        const page = await listUseCase().execute({ fields: FIELDS.join(','),
limit: '50' });
        const pdf = await exportFinance({ fields: FIELDS,
format: 'pdf' });
        expect(pdf.error).toBeUndefined();
        expect(page.data.map(r => r.cells)).toEqual(pdf.result!.pdf!.rows);
        expect(page.columns!.map(c => [c.key, c.label, c.type, c.weight])).toEqual(
            pdf.result!.pdf!.columns.map(c => [c.key, c.label, c.type, c.weight]),
        );
        expect(page.data[0].cells).toEqual([
            '1', '128', '10/05/2026', 'Saída', '12.345.678/0001-90', '(44) 99999-8888', '85990-000', '1,50', 'Não', '=SOMA(A1)',
            '12.345,67', '',
        ]);
    });

    it('o Nº de ordem conta a lista inteira: começa em (page − 1) × limit + 1', async () => {
        giveList(ROWS, 53);
        const page = await listUseCase().execute({ fields: 'ordinal,description',
page: '3',
limit: '20' });
        expect(page.data.map(r => r.cells![0])).toEqual(['41', '42', '43']);
        expect(vi.mocked(financeRepo.listTransactions).mock.calls[0][0]).toMatchObject({ skip: 40,
take: 20 });
    });

    it.each([
        ['', 'Escolha pelo menos um campo.'],
        [' , ', 'Escolha pelo menos um campo.'],
        ['number,naoExiste', 'Campo desconhecido: naoExiste.'],
        ['number,date,number', 'Campo repetido: Nº.'],
        [Array.from({ length: 81 }, () => 'number').join(','), 'No máximo 80 campos por relatório.'],
    ])('fields=%j → 400 "%s", antes de consultar o banco', async (fields, message) => {
        giveList(ROWS);
        const err = await listUseCase().execute({ fields }).catch(e => e);
        expect(err).toBeInstanceOf(ValidationError);
        expect(err.message).toBe(message);
        expect(financeRepo.listTransactions).not.toHaveBeenCalled();
    });

    it('campo com permissão própria que quem pede não tem → ForbiddenError (hoje nenhum nesta fonte)', async () => {
        const original = financeTransactionsSource.fields.find(f => f.key === 'payeeDocument')!;
        original.permission = 'READ_USER';
        try {
            giveList(ROWS);
            const err = await listUseCase().execute({ fields: 'number,payeeDocument' }, { has: () => false }).catch(e => e);
            expect(err).toBeInstanceOf(ForbiddenError);
            expect(err.message).toBe('Sem permissão para exportar: CNPJ / CPF.');
            const ok = await listUseCase().execute({ fields: 'number,payeeDocument' }, { has: p => p === 'READ_USER' });
            expect(ok.columns).toHaveLength(2);
        } finally {
            delete original.permission;
        }
    });

    it('filtro inválido continua com a mensagem de sempre, mesmo com fields', async () => {
        const err = await listUseCase().execute({ fields: 'number',
type: 'X' }).catch(e => e);
        expect(err.message).toBe('Parâmetro inválido: type');
    });
});

describe('filtros que a visão guarda', () => {
    const read = (value: unknown) => readVisaoFilters(financeTransactionsSource, value);

    it('chaves aceitas: os filtros da lista menos from, to, search e ids, mais periodo', () => {
        expect(visaoFilterKeys(financeTransactionsSource)).toEqual(
            ['type', 'categoryId', 'accountId', 'method', 'orderBy', 'excludeTransfers', 'periodo'],
        );
    });

    it('guarda só o que está ligado, normalizado e na ordem dos filtros, com o período no fim', () => {
        expect(read({ periodo: 'ano-atual',
excludeTransfers: 'true',
method: 'PIX',
accountId: ACC,
categoryId: CAT,
type: 'OUT',
orderBy: 'number' }))
            .toEqual({ type: 'OUT',
categoryId: CAT,
accountId: ACC,
method: 'PIX',
orderBy: 'number',
excludeTransfers: true,
periodo: 'ano-atual' });
        expect(JSON.stringify(read({ periodo: 'mes-atual',
type: 'IN' }))).toBe('{"type":"IN","periodo":"mes-atual"}');
    });

    it('null, "" e false não são guardados; sem nenhum ligado → null', () => {
        expect(read({ type: null,
categoryId: '',
excludeTransfers: false,
periodo: null,
method: 'PIX' })).toEqual({ method: 'PIX' });
        expect(read({ type: null,
excludeTransfers: false })).toBeNull();
        expect(read({})).toBeNull();
        expect(read(null)).toBeNull();
        expect(read(undefined)).toBeUndefined();
    });

    it.each([
        [{ from: '2026-01-01' }, 'Filtro inválido na visão: from.'],
        [{ to: '2026-01-31' }, 'Filtro inválido na visão: to.'],
        [{ search: 'coop' }, 'Filtro inválido na visão: search.'],
        [{ ids: ['a'] }, 'Filtro inválido na visão: ids.'],
        [{ campoNovo: 1 }, 'Filtro inválido na visão: campoNovo.'],
        [{ type: 'X' }, 'Filtro inválido na visão: type.'],
        [{ categoryId: 'nao-e-uuid' }, 'Filtro inválido na visão: categoryId.'],
        [{ excludeTransfers: 'talvez' }, 'Filtro inválido na visão: excludeTransfers.'],
        [{ orderBy: 'valor' }, 'Filtro inválido na visão: orderBy.'],
        [{ method: { a: 1 } }, 'Filtro inválido na visão: method.'],
        [{ periodo: 'setembro' }, 'Filtro inválido na visão: periodo.'],
        [{ periodo: 3 }, 'Filtro inválido na visão: periodo.'],
        [['type'], 'Filtro inválido na visão: filters.'],
        ['IN', 'Filtro inválido na visão: filters.'],
        [{ method: 'x'.repeat(2100) }, 'Os filtros da visão passam de 2 KB.'],
    ])('%j → 400 "%s"', (value, message) => {
        const r = read(value);
        expect(r).toBeInstanceOf(ValidationError);
        expect((r as Error).message).toBe(message);
    });

    it('fonte sem visões: objeto → 400 "Este relatório não guarda filtros."; null é ignorado', () => {
        const people = EXPORT_SOURCES.people;
        const r = readVisaoFilters(people, { search: 'x' });
        expect(r).toBeInstanceOf(ValidationError);
        expect((r as Error).message).toBe(VISAO_MESSAGES.notSupported);
        expect(readVisaoFilters(people, null)).toBeUndefined();
        expect(readVisaoFilters(people, undefined)).toBeUndefined();
    });

    it('em palavras, com as frases da linha "Filtros:" do PDF e o período no fim', async () => {
        expect(await visaoFiltersText(financeTransactionsSource, visao('contabilidade').filters, exportRepo))
            .toBe('Tipo: Entrada · Sem transferências entre caixas · Período: mês passado');
        vi.mocked(exportRepo.financeNames).mockResolvedValue({ category: 'INSUMOS',
account: 'BANCO' });
        expect(await visaoFiltersText(financeTransactionsSource, { type: 'OUT',
categoryId: CAT,
accountId: ACC,
method: 'PIX',
orderBy: 'number',
periodo: 'ultimos-12-meses' }, exportRepo))
            .toBe('Tipo: Saída · Categoria: INSUMOS · Caixa: BANCO · Forma de pagamento: PIX · Ordem: Nº · Período: últimos 12 meses');
        expect(exportRepo.financeNames).toHaveBeenCalledWith({ categoryId: CAT,
accountId: ACC });
        expect(await visaoFiltersText(financeTransactionsSource, null, exportRepo)).toBeNull();
        expect(await visaoFiltersText(financeTransactionsSource, {}, exportRepo)).toBeNull();
    });
});

describe('exportação de uma visão: "Visão:" no arquivo', () => {
    const FIELDS = visao('contabilidade').fields;

    it('PDF: visao com o nome e modelo null; details.modelo leva o nome da visão', async () => {
        const r = await exportFinance({ fields: FIELDS,
format: 'pdf',
visao: 'Contabilidade (alterada)' });
        expect(r.error).toBeUndefined();
        expect(r.result!.pdf).toMatchObject({ modelo: null,
visao: 'Contabilidade (alterada)' });
        expect(r.result!.auditDetails!.modelo).toBe('Contabilidade (alterada)');
    });

    it('o id de uma visão de fábrica vira o nome', async () => {
        const r = await exportFinance({ fields: FIELDS,
format: 'pdf',
visao: 'contabilidade' });
        expect(r.result!.pdf!.visao).toBe('Contabilidade');
    });

    it('Excel: a aba "Sobre" diz "Visão" no lugar de "Modelo"', async () => {
        const r = await exportFinance({ fields: FIELDS,
format: 'xlsx',
visao: 'Contabilidade' });
        const { sheets: [, sobre] } = readXlsx(r.result!.xlsx!);
        expect(sobre.rows.find(([k]) => k === 'Visão')).toEqual(['Visão', 'Contabilidade']);
        expect(sobre.rows.map(([k]) => k)).not.toContain('Modelo');
    });

    it('sem visao, nada muda: PDF sem o campo, "Modelo" no Excel', async () => {
        const pdf = await exportFinance({ fields: FIELDS,
format: 'pdf',
modelo: 'contabilidade' });
        expect(pdf.result!.pdf).not.toHaveProperty('visao');
        expect(pdf.result!.pdf!.modelo).toBe('Contabilidade');
        const xlsx = await exportFinance({ fields: FIELDS,
format: 'xlsx',
modelo: 'contabilidade' });
        expect(readXlsx(xlsx.result!.xlsx!).sheets[1].rows.find(([k]) => k === 'Modelo')).toEqual(['Modelo', 'Contabilidade']);
    });

    it('o CSV com visao é o mesmo de sem visao', async () => {
        const com = await exportFinance({ fields: FIELDS,
visao: 'Contabilidade' });
        const sem = await exportFinance({ fields: FIELDS });
        expect(com.result!.csv).toBe(sem.result!.csv);
    });

    it('modelo e visao juntos → 400; visao acima de 64 → 400', async () => {
        const both = await exportFinance({ fields: FIELDS,
modelo: 'x',
visao: 'y' });
        expect(both.error!.message).toBe(MODELO_E_VISAO_MESSAGE);
        const long = await exportFinance({ fields: FIELDS,
visao: 'v'.repeat(65) });
        expect(long.error!.message).toBe('Parâmetro inválido: visao');
    });
});

// ── Visões da equipe (modelos com filters) ───────────────────────────────────

function memoryRepo() {
    const rows: ReportTemplateModel[] = [];
    const repo: ReportTemplateRepository = {
        async listActive(dataset) {
            return rows.filter(r => r.dataset === dataset && !r.isDeleted);
        },
        async findActive(dataset, id) {
            return rows.find(r => r.id === id && r.dataset === dataset && !r.isDeleted) ?? null;
        },
        async create(data) {
            const row: ReportTemplateModel = {
                id: randomUUID(),
                ...data,
                filters: data.filters as ReportTemplateModel['filters'],
                updatedById: null,
                isDeleted: false,
                deletedAt: null,
                createdAt: NOW,
                updatedAt: NOW,
            };
            rows.push(row);
            return row;
        },
        async update(id, data) {
            const row = rows.find(r => r.id === id && !r.isDeleted);
            if (!row) return null;
            Object.assign(row, data);
            return row;
        },
        async softDelete() {
            return true;
        },
        async adminUsernames() {
            return new Map();
        },
    };
    return { repo,
rows };
}

describe('visões da equipe: filters nos modelos', () => {
    const maria: TemplateActor = { id: 'admin-maria',
has: () => true };
    let mem: ReturnType<typeof memoryRepo>;
    let useCase: ReportTemplatesUseCase;
    const FIELDS = ['number', 'date', 'amount'];

    beforeEach(() => {
        mem = memoryRepo();
        useCase = new ReportTemplatesUseCase(mem.repo);
    });

    it('salva os filtros normalizados; sem filters, null (como os modelos de antes)', async () => {
        const r = await useCase.create('finance-transactions', { name: 'Receitas do mês',
fields: FIELDS,
filters: { type: 'IN',
excludeTransfers: true,
categoryId: '',
periodo: 'mes-atual' } }, maria);
        expect(r.error).toBeUndefined();
        expect(r.template!.filters).toEqual({ type: 'IN',
excludeTransfers: true,
periodo: 'mes-atual' });
        expect(mem.rows[0].filters).toEqual({ type: 'IN',
excludeTransfers: true,
periodo: 'mes-atual' });
        const sem = await useCase.create('finance-transactions', { name: 'Só colunas',
fields: FIELDS }, maria);
        expect(sem.template!.filters).toBeNull();
        expect(mem.rows[1].filters).toBeNull();
    });

    it('PATCH: muda os filtros, null tira, e só filters já é algo para alterar', async () => {
        const { template } = await useCase.create('finance-transactions', { name: 'Visão',
fields: FIELDS,
filters: { type: 'IN' } }, maria);
        const r1 = await useCase.update('finance-transactions', template!.id, { filters: { type: 'OUT',
periodo: 'ano-atual' } }, maria);
        expect(r1.error).toBeUndefined();
        expect(r1.template!.filters).toEqual({ type: 'OUT',
periodo: 'ano-atual' });
        const r2 = await useCase.update('finance-transactions', template!.id, { filters: null }, maria);
        expect(r2.template!.filters).toBeNull();
        const r3 = await useCase.update('finance-transactions', template!.id, { name: 'Outra' }, maria);
        expect(r3.template!.filters).toBeNull();
    });

    it('filtro inválido → 400, nada gravado', async () => {
        const r = await useCase.create('finance-transactions', { name: 'Ruim',
fields: FIELDS,
filters: { search: 'coop' } }, maria);
        expect(r.error).toBeInstanceOf(ValidationError);
        expect(r.error!.message).toBe('Filtro inválido na visão: search.');
        expect(mem.rows).toHaveLength(0);
    });

    it('fonte sem visões: filters com objeto → 400; null é ignorado; a resposta traz filters null', async () => {
        const r = await useCase.create('people', { name: 'Pessoas',
fields: ['name'],
filters: { search: 'x' } }, maria);
        expect(r.error!.message).toBe(VISAO_MESSAGES.notSupported);
        const ok = await useCase.create('people', { name: 'Pessoas',
fields: ['name'],
filters: null }, maria);
        expect(ok.error).toBeUndefined();
        expect(ok.template!.filters).toBeNull();
        const patch = await useCase.update('people', ok.template!.id, { filters: null }, maria);
        expect(patch.error!.message).toBe(TEMPLATE_MESSAGES.nothingToChange);
    });

    it.each(['Padrão', 'padrao-tela', 'Contabilidade', 'Completa (como a planilha de antes)', 'resumida', 'RESUMIDA', 'Resumido'])(
        '409: "%s" é nome (ou id) de visão ou modelo de fábrica dos Lançamentos',
        async name => {
            const r = await useCase.create('finance-transactions', { name,
fields: FIELDS }, maria);
            expect(r.error).toBeInstanceOf(ConflictError);
            expect(r.error!.message).toBe(TEMPLATE_MESSAGES.visaoFactoryName);
        },
    );

    it('409 de nome repetido nos Lançamentos fala em visão; nas outras fontes, em modelo', async () => {
        await useCase.create('finance-transactions', { name: 'Receitas',
fields: FIELDS }, maria);
        const r = await useCase.create('finance-transactions', { name: 'receitas',
fields: FIELDS }, maria);
        expect(r.error!.message).toBe('Já existe uma visão da equipe com esse nome.');
        await useCase.create('people', { name: 'Equipe',
fields: ['name'] }, maria);
        const p = await useCase.create('people', { name: 'equipe',
fields: ['name'] }, maria);
        expect(p.error!.message).toBe('Já existe um modelo da equipe com esse nome.');
    });

    it('auditoria: filters só aparece nas fontes com visões', () => {
        const base = { name: 'X',
fields: ['number'],
format: null,
confirmed: null };
        expect(reportTemplateAuditSnapshot({ ...base,
dataset: 'finance-transactions' }, 'Tipo: Entrada')).toEqual({ name: 'X',
fields: 'Nº',
format: null,
filters: 'Tipo: Entrada' });
        expect(reportTemplateAuditSnapshot({ ...base,
dataset: 'finance-transactions' })).toHaveProperty('filters', null);
        expect(reportTemplateAuditSnapshot({ ...base,
fields: ['name'],
dataset: 'people' }, 'qualquer')).not.toHaveProperty('filters');
    });
});
