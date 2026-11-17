import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExportDataUseCase } from '../export-data.js';
import type { ExportRepository } from '../../ports/external/export-repository.js';
import { EXPORT_SOURCES } from '../export/catalog/index.js';
import { financeExportTotals, TRANSFER_NOTE } from '../export/catalog/finance-transactions.js';
import { reais } from '../export/format.js';
import { readXlsx } from '../../lib/__tests__/xlsx-reader.js';

// Modelo "Contabilidade" e totais no Excel e no PDF dos Lançamentos (SR-131).
// A regra dos totais é a da tela (`sumTransactions`): por tipo, sem as
// transferências entre caixas, em centavos inteiros.

const repo = {
    financeTransactions: vi.fn(),
    financeNames: vi.fn(),
} as unknown as ExportRepository;

// 17/09/2026 10:00 em Brasília.
const now = () => new Date('2026-09-17T13:00:00.000Z');
const useCase = () => new ExportDataUseCase(repo, now);

let n = 0;
function tx(overrides: Record<string, unknown> = {}) {
    n += 1;
    return {
        id: `t${n}`,
        number: n,
        type: 'IN',
        amountCents: 10000,
        date: new Date('2026-05-10T00:00:00.000Z'),
        description: `Lançamento ${n}`,
        method: 'PIX',
        notes: null,
        categoryId: null,
        accountId: null,
        transferId: null,
        recurringId: null,
        empenho: null,
        category: { name: 'MENSALIDADE' },
        account: { name: 'BANCO' },
        attachments: [],
        createdAt: new Date('2026-05-10T15:30:00.000Z'),
        ...overrides,
    };
}

const give = (...rows: object[]) => vi.mocked(repo.financeTransactions).mockResolvedValue(rows as never);

const FIELDS = ['number', 'date', 'description', 'amount'];

async function xlsxOf(rows: object[], body: Record<string, unknown> = { fields: FIELDS }) {
    give(...rows);
    const r = await useCase().execute('finance-transactions', { ...body,
format: 'xlsx' });
    expect(r.error).toBeUndefined();
    return { result: r.result!,
...readXlsx(r.result!.xlsx!) };
}

async function pdfOf(rows: object[], body: Record<string, unknown> = { fields: FIELDS }) {
    give(...rows);
    const r = await useCase().execute('finance-transactions', { ...body,
format: 'pdf' });
    expect(r.error).toBeUndefined();
    return r.result!.pdf!;
}

beforeEach(() => {
    vi.clearAllMocks();
    n = 0;
});

describe('modelo Contabilidade', () => {
    it('está no catálogo, depois do Resumido, com as 8 colunas na ordem pedida', () => {
        const { modelos, fields } = EXPORT_SOURCES['finance-transactions'];
        expect(modelos.map(m => m.id)).toEqual(['resumido', 'contabilidade']);
        const contabilidade = modelos.find(m => m.id === 'contabilidade')!;
        expect(contabilidade).toEqual({
            id: 'contabilidade',
            name: 'Contabilidade',
            fields: ['number', 'date', 'payeeName', 'payeeDocument', 'description', 'category', 'method', 'amount'],
        });
        const labels = contabilidade.fields.map(k => fields.find(f => f.key === k)!.label);
        expect(labels).toEqual(['Nº', 'Data', 'Nome / Razão social', 'CNPJ / CPF', 'Descrição', 'Categoria', 'Forma de pagamento', 'Valor (R$)'].map(l => (l === 'Forma de pagamento' ? 'Método' : l)));
    });

    it('o modelo não filtra: exportar com ele não manda nenhum filtro à consulta', async () => {
        give(tx());
        const { fields } = EXPORT_SOURCES['finance-transactions'].modelos.find(m => m.id === 'contabilidade')!;
        const r = await useCase().execute('finance-transactions', { fields,
modelo: 'contabilidade',
format: 'pdf' });
        expect(r.result!.pdf).toMatchObject({ modelo: 'Contabilidade',
filters: '' });
        const filters = vi.mocked(repo.financeTransactions).mock.calls[0][0];
        expect(filters.type).toBeUndefined();
    });
});

describe('reais', () => {
    it('centavos inteiros em "R$ 1.234,56", sem float', () => {
        expect(reais(0)).toBe('R$ 0,00');
        expect(reais(5)).toBe('R$ 0,05');
        expect(reais(123456)).toBe('R$ 1.234,56');
        expect(reais(100000000)).toBe('R$ 1.000.000,00');
        expect(reais(-50)).toBe('-R$ 0,50');
    });
});

describe('financeExportTotals (a regra da tela)', () => {
    it('soma por tipo, sem transferência e sem "só nota"; centavos inteiros', () => {
        const totals = financeExportTotals([
            tx({ amountCents: 10 }),
            tx({ amountCents: 20 }),
            tx({ type: 'OUT',
amountCents: 333 }),
            tx({ type: null,
amountCents: 999999 }),
            tx({ transferId: 'x',
amountCents: 5000 }),
            tx({ type: 'OUT',
transferId: 'x',
amountCents: 5000 }),
        ] as never);
        expect(totals).toEqual({
            lines: [{ label: 'Total de entradas',
cents: 30 }, { label: 'Total de saídas',
cents: 333 }],
            note: TRANSFER_NOTE,
        });
    });

    it('sem nenhum lançamento com tipo e sem transferência: sem totais', () => {
        expect(financeExportTotals([])).toBeNull();
        expect(financeExportTotals([tx({ type: null }) as never])).toBeNull();
    });
});

describe('Excel com totais', () => {
    it('só entradas: uma linha "Total de entradas", depois de uma linha em branco; o valor é número em moeda', async () => {
        const { sheets: [dados], result } = await xlsxOf([tx({ amountCents: 10005 }), tx({ amountCents: 259 })]);
        expect(dados.rows).toEqual([
            ['Nº', 'Data', 'Descrição', 'Valor (R$)'],
            ['1', dados.rows[1][1], 'Lançamento 1', '100.05'],
            ['2', dados.rows[2][1], 'Lançamento 2', '2.59'],
            [],
            ['Total de entradas', '', '', '102.64'],
        ]);
        expect(dados.cells.get('A5')).toMatchObject({ style: 1,
value: 'Total de entradas' });
        // O mesmo formato de moeda da coluna Valor.
        expect(dados.cells.get('D5')).toMatchObject({ style: 3,
type: null,
value: '102.64' });
        expect(dados.cells.get('D2')!.style).toBe(3);
        // Os registros continuam sendo só os registros.
        expect(result.count).toBe(2);
    });

    it('entradas e saídas: duas linhas, na ordem entradas e saídas', async () => {
        const { sheets: [dados] } = await xlsxOf([
            tx({ amountCents: 10000 }),
            tx({ type: 'OUT',
amountCents: 2550 }),
            tx({ type: 'OUT',
amountCents: 50 }),
        ]);
        expect(dados.rows.slice(4)).toEqual([
            [],
            ['Total de entradas', '', '', '100'],
            ['Total de saídas', '', '', '26'],
        ]);
        expect(dados.rows).toHaveLength(7);
    });

    it('só saídas: só a linha "Total de saídas"', async () => {
        const { sheets: [dados] } = await xlsxOf([tx({ type: 'OUT',
amountCents: 4200 })]);
        expect(dados.rows.slice(2)).toEqual([[], ['Total de saídas', '', '', '42']]);
    });

    it('transferência: fica fora do total e a nota sai numa linha só de texto', async () => {
        const { sheets: [dados, sobre] } = await xlsxOf([
            tx({ amountCents: 10000 }),
            tx({ transferId: 'x',
amountCents: 70000 }),
            tx({ type: 'OUT',
transferId: 'x',
amountCents: 70000 }),
        ]);
        expect(dados.rows.slice(4)).toEqual([
            [],
            ['Total de entradas', '', '', '100'],
            ['Total de saídas', '', '', '0'],
            [TRANSFER_NOTE],
        ]);
        expect(dados.cells.get('A8')).toMatchObject({ style: 2,
value: TRANSFER_NOTE });
        expect(sobre.rows.find(([k]) => k === 'Observação')).toEqual(['Observação', TRANSFER_NOTE]);
    });

    it('sem a coluna Valor: sem totais', async () => {
        const { sheets: [dados, sobre] } = await xlsxOf(
            [tx(), tx({ type: 'OUT' })],
            { fields: ['number', 'description'] },
        );
        expect(dados.rows).toHaveLength(3);
        expect(JSON.stringify(dados.rows)).not.toContain('Total');
        expect(sobre.rows.map(([k]) => k)).not.toContain('Total de entradas');
    });

    it('sem fields (o padrão de hoje): sem totais', async () => {
        give(tx(), tx());
        const r = await useCase().execute('finance-transactions', { format: 'xlsx' });
        const { sheets: [dados] } = readXlsx(r.result!.xlsx!);
        expect(dados.rows).toHaveLength(3);
    });

    it('o Valor na primeira coluna: o rótulo vai na segunda', async () => {
        const { sheets: [dados] } = await xlsxOf([tx({ amountCents: 1500 })], { fields: ['amount', 'description'] });
        expect(dados.rows).toEqual([
            ['Valor (R$)', 'Descrição'],
            ['15', 'Lançamento 1'],
            [],
            ['15', 'Total de entradas'],
        ]);
        expect(dados.cells.get('A4')).toMatchObject({ style: 3,
value: '15' });
        expect(dados.cells.get('B4')).toMatchObject({ style: 1,
value: 'Total de entradas' });
    });

    it('só o Valor: o rótulo abre uma segunda coluna', async () => {
        const { sheets: [dados] } = await xlsxOf([tx({ amountCents: 1500 })], { fields: ['amount'] });
        expect(dados.rows.slice(2)).toEqual([[], ['15', 'Total de entradas']]);
    });

    it('a aba "Sobre" tem os mesmos totais; os registros continuam contando só os registros', async () => {
        const { sheets: [, sobre] } = await xlsxOf([
            tx({ amountCents: 10000 }),
            tx({ type: 'OUT',
amountCents: 2550 }),
        ]);
        const keys = sobre.rows.map(([k]) => k);
        expect(keys).toEqual(['Relatório', 'Gerado em', 'Registros', 'Total de entradas', 'Total de saídas', 'Escopo', 'Campos']);
        expect(sobre.rows.find(([k]) => k === 'Registros')).toEqual(['Registros', '2']);
        expect(sobre.cells.get('B4')).toMatchObject({ style: 3,
value: '100' });
        expect(sobre.cells.get('B5')).toMatchObject({ style: 3,
value: '25.5' });
    });

    it('lançamentos "só nota" não somam; sem outro tipo, sem totais', async () => {
        const { sheets: [dados] } = await xlsxOf([tx({ type: null })]);
        expect(dados.rows).toHaveLength(2);
    });

    it('outra fonte não muda: pessoas em Excel não ganham linha de total', async () => {
        expect(EXPORT_SOURCES.people.totals).toBeUndefined();
    });
});

describe('JSON do PDF com totais', () => {
    it('totais formatados em reais, na ordem; sem nota quando não há transferência', async () => {
        const pdf = await pdfOf([
            tx({ amountCents: 123456 }),
            tx({ type: 'OUT',
amountCents: 5 }),
        ]);
        expect(pdf.totais).toEqual([
            { rotulo: 'Total de entradas',
valor: 'R$ 1.234,56' },
            { rotulo: 'Total de saídas',
valor: 'R$ 0,05' },
        ]);
        expect('notaDosTotais' in pdf).toBe(false);
        expect(pdf.count).toBe(2);
        expect(pdf.rows).toHaveLength(2);
    });

    it('com transferência: fora do total e com a nota', async () => {
        const pdf = await pdfOf([
            tx({ amountCents: 10000 }),
            tx({ transferId: 'x',
amountCents: 70000 }),
            tx({ type: 'OUT',
transferId: 'x',
amountCents: 70000 }),
        ]);
        expect(pdf.totais).toEqual([
            { rotulo: 'Total de entradas',
valor: 'R$ 100,00' },
            { rotulo: 'Total de saídas',
valor: 'R$ 0,00' },
        ]);
        expect(pdf.notaDosTotais).toBe('Transferências entre caixas não entram nos totais.');
    });

    it('sem o Valor nas colunas, sem fields ou sem lançamento: os campos nem aparecem', async () => {
        const semValor = await pdfOf([tx()], { fields: ['number', 'description'] });
        expect('totais' in semValor).toBe(false);
        expect('notaDosTotais' in semValor).toBe(false);

        const semFields = await pdfOf([tx()], {});
        expect('totais' in semFields).toBe(false);

        const vazio = await pdfOf([]);
        expect('totais' in vazio).toBe(false);
        expect('notaDosTotais' in vazio).toBe(false);
    });

    it('os totais são dos registros que saíram (a seleção/filtro chega à consulta)', async () => {
        const pdf = await pdfOf([tx({ amountCents: 700 })], { fields: FIELDS,
type: 'IN',
search: 'x' });
        expect(pdf.totais).toEqual([{ rotulo: 'Total de entradas',
valor: 'R$ 7,00' }]);
        expect(pdf.filters).toBe('Tipo: Entrada · Busca: x');
    });
});

describe('CSV não muda', () => {
    it('com fields, o CSV não tem linha de total', async () => {
        give(tx({ amountCents: 1000 }), tx({ type: 'OUT',
amountCents: 300 }));
        const r = await useCase().execute('finance-transactions', { fields: FIELDS,
format: 'csv' });
        const lines = r.result!.csv.replace(/^﻿/, '').trim().split('\r\n');
        expect(lines).toHaveLength(3);
        expect(r.result!.csv).not.toContain('Total');
        expect(r.result!.pdf).toBeUndefined();
    });
});
