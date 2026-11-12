import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExportDataUseCase } from '../export-data.js';
import type { ExportRepository } from '../../ports/external/export-repository.js';
import { EXPORT_SOURCES } from '../export/catalog/index.js';
import { brasiliaWallClock, columnWidth } from '../export/xlsx.js';
import { readXlsx, serialToIso, type ReadSheet } from '../../lib/__tests__/xlsx-reader.js';
import { columnName } from '../../lib/xlsx.js';

// O montador em Excel (SR-104): o tipo do campo decide a célula, a aba "Sobre"
// leva o título e os filtros, e a auditoria diz "Excel".

const repo = {
    people: vi.fn(),
    companies: vi.fn(),
    admins: vi.fn(),
    financeTransactions: vi.fn(),
    financeNames: vi.fn(),
} as unknown as ExportRepository;

// 17/09/2026 10:00 em Brasília.
const now = () => new Date('2026-09-17T13:00:00.000Z');
const useCase = () => new ExportDataUseCase(repo, now);

function person(overrides: Record<string, unknown> = {}) {
    return {
        id: 'p1',
        name: 'JOÃO DA SILVA',
        nickname: null,
        cpf: '12345678909',
        rg: '1234567',
        rgIssuer: null,
        rgIssuedAt: null,
        birthDate: new Date('1980-09-18T00:00:00.000Z'),
        gender: null,
        maritalStatus: null,
        nationality: null,
        birthPlace: null,
        ethnicity: null,
        educationLevel: null,
        specialNeeds: false,
        driverLicense: null,
        driverLicenseCategory: null,
        email: 'joao@test.com',
        phone: '44999990000',
        phone2: null,
        phone3: null,
        memberType: null,
        memberClassification: null,
        functionalCategory: null,
        familyIncome: null,
        cadPro: [],
        memberStatus: null,
        memberSince: null,
        membershipValidUntil: null,
        memberNotesNumber: null,
        memberNotes: '=HYPERLINK("x")',
        boardMember: false,
        boardPosition: null,
        primaryPropertyId: null,
        createdAt: new Date('2026-01-02T15:30:00.000Z'),
        updatedAt: new Date('2026-01-02T15:30:00.000Z'),
        properties: [],
        companyMemberships: [],
        relations: [],
        userAdmin: null,
        userInstructor: null,
        unimed: null,
        publicContact: null,
        _count: { courseUserRegistration: 0 },
        ...overrides,
    };
}

const label = (dataset: 'people' | 'finance-transactions', key: string) =>
    (EXPORT_SOURCES[dataset].fields as {
 key: string;
label: string 
}[]).find(f => f.key === key)!.label;

/** A célula da linha 2 (o primeiro registro) na coluna do rótulo. */
function cellOf(sheet: ReadSheet, header: string, row = 2) {
    const col = sheet.rows[0].indexOf(header);
    expect(col, `coluna "${header}"`).toBeGreaterThanOrEqual(0);
    return sheet.cells.get(`${columnName(col)}${row}`);
}

beforeEach(() => {
    vi.mocked(repo.people).mockReset();
    vi.mocked(repo.people).mockResolvedValue([person()] as never);
});

describe('montador em Excel', () => {
    const fields = ['ordinal', 'name', 'cpf', 'phone', 'birthDate', 'age', 'activeMember', 'memberNotes', 'createdAt', 'signature'];

    it('o arquivo, o nome, os headers da auditoria e os detalhes', async () => {
        const r = await useCase().execute('people', { ids: ['p1'],
fields,
format: 'xlsx',
modelo: 'nome-cpf' });
        expect(r.error).toBeUndefined();
        expect(r.result).toMatchObject({
            format: 'xlsx',
            csv: '',
            count: 1,
            filename: 'pessoa-joao-da-silva-2026-09-17.xlsx',
        });
        expect(r.result!.auditLabel).toMatch(/^Pessoas: JOÃO DA SILVA · Excel · com CPF, /);
        expect(r.result!.auditDetails).toMatchObject({ formato: 'xlsx',
modelo: 'Nome e CPF',
escopo: 'seleção',
linhas: 1 });
        expect(r.result!.xlsx!.subarray(0, 2).toString()).toBe('PK');
    });

    it('cada tipo vira a célula certa; texto que parece fórmula fica texto', async () => {
        const r = await useCase().execute('people', { ids: ['p1'],
fields,
format: 'xlsx' });
        const { sheets: [dados] } = readXlsx(r.result!.xlsx!);
        expect(dados.name).toBe('Pessoas');
        expect(dados.rows[0]).toEqual(fields.map(k => label('people', k)));
        expect(dados.xml).toContain('state="frozen"');
        expect(dados.xml).not.toContain('<f');

        // Nº de ordem e idade: números.
        expect(cellOf(dados, 'Nº de ordem')).toMatchObject({ style: 0,
type: null,
value: '1' });
        expect(cellOf(dados, label('people', 'age'))).toMatchObject({ style: 0,
type: null,
value: '45' });
        // CPF e telefone: texto com máscara, como no CSV com fields.
        expect(cellOf(dados, 'CPF')).toMatchObject({ style: 2,
type: 'inlineStr',
value: '123.456.789-09' });
        expect(cellOf(dados, 'Telefone')).toMatchObject({ style: 2,
type: 'inlineStr',
value: '(44) 99999-0000' });
        // Sim/Não: texto.
        expect(cellOf(dados, label('people', 'activeMember'))).toMatchObject({ style: 2,
value: 'Não' });
        // Fórmula: texto, sem o apóstrofo do CSV.
        expect(cellOf(dados, label('people', 'memberNotes'))).toMatchObject({ style: 2,
type: 'inlineStr',
value: '=HYPERLINK("x")',
formula: false });
        // Data pura: dd/mm/aaaa; "criado em": no horário de Brasília (15:30Z = 12:30).
        const birth = cellOf(dados, label('people', 'birthDate'))!;
        expect(birth.style).toBe(4);
        expect(serialToIso(birth.value)).toBe('1980-09-18 00:00');
        const created = cellOf(dados, label('people', 'createdAt'))!;
        expect(created.style).toBe(5);
        expect(serialToIso(created.value)).toBe('2026-01-02 12:30');
        // Assinatura: em branco e larga.
        expect(cellOf(dados, 'Assinatura')).toBeUndefined();
        expect(dados.xml).toMatch(/<col min="10" max="10" width="(3\d|[4-6]\d)" customWidth="1"\/>/);
    });

    it('a aba "Sobre": título, data, total, escopo, filtros, modelo e campos', async () => {
        const r = await useCase().execute('people', { ids: ['p1'],
fields: ['name', 'cpf'],
format: 'xlsx',
modelo: 'nome-cpf' });
        const { sheets } = readXlsx(r.result!.xlsx!);
        expect(sheets.map(s => s.name)).toEqual(['Pessoas', 'Sobre']);
        const sobre = sheets[1];
        expect(sobre.xml).not.toContain('<pane');
        const rows = sobre.rows.map(([k, v]) => [k, k === 'Gerado em' ? serialToIso(v) : v]);
        expect(rows).toEqual([
            ['Relatório', 'Pessoas'],
            ['Gerado em', '2026-09-17 10:00'],
            ['Registros', '1'],
            ['Escopo', 'Selecionados'],
            ['Filtros', 'Seleção: 1 registro'],
            ['Modelo', 'Nome e CPF'],
            ['Campos', 'Nome, CPF'],
        ]);
        expect(sobre.cells.get('A1')!.style).toBe(1);
    });

    it('sem fields: o padrão, com o telefone como gravado, mas em célula de texto', async () => {
        const r = await useCase().execute('people', { format: 'xlsx' });
        const { sheets: [dados, sobre] } = readXlsx(r.result!.xlsx!);
        expect(dados.rows[0]).toHaveLength(EXPORT_SOURCES.people.padrao.length);
        expect(cellOf(dados, 'Telefone')).toMatchObject({ style: 2,
type: 'inlineStr',
value: '44999990000' });
        expect(sobre.rows.find(([k]) => k === 'Modelo')).toEqual(['Modelo', 'Padrão (como hoje)']);
        expect(sobre.rows.find(([k]) => k === 'Escopo')).toEqual(['Escopo', 'Todos']);
        expect(sobre.rows.find(([k]) => k === 'Filtros')).toBeUndefined();
        expect(r.result!.auditLabel).toMatch(/^Pessoas: 1 registro \(todos\) · Excel · com /);
    });

    it('o limite do PDF não vale: 2.001 linhas saem; 20.001 → 400', async () => {
        vi.mocked(repo.people).mockResolvedValue(Array.from({ length: 2001 }, () => person()) as never);
        const ok = await useCase().execute('people', { fields: ['name'],
format: 'xlsx' });
        expect(ok.result!.count).toBe(2001);
        expect(readXlsx(ok.result!.xlsx!).sheets[0].rows).toHaveLength(2002);

        vi.mocked(repo.people).mockResolvedValue(Array.from({ length: 20001 }, () => person()) as never);
        const tooMany = await useCase().execute('people', { fields: ['name'],
format: 'xlsx' });
        expect(tooMany.error!.message).toBe('O relatório passa de 20.000 linhas. Use um filtro para diminuir.');
    });

    it('lançamentos: dinheiro é número com formato de moeda; a data é data', async () => {
        vi.mocked(repo.financeTransactions).mockResolvedValue([{
            id: 'tx',
            number: 12,
            type: 'OUT',
            date: new Date('2026-05-10T00:00:00Z'),
            description: '+CompraSuspeita',
            method: 'PIX',
            notes: null,
            amountCents: 123456,
            recurringId: null,
            category: { name: 'Insumos' },
            account: { name: 'Caixa A' },
            empenho: { cnpjCpf: '12345678000190',
razaoSocial: 'COOP' },
        }] as never);
        const r = await useCase().execute('finance-transactions', { format: 'xlsx' });
        expect(r.result!.filename).toBe('lancamentos-2026-09-17.xlsx');
        const { sheets: [dados] } = readXlsx(r.result!.xlsx!);
        expect(dados.name).toBe('Lançamentos');
        expect(cellOf(dados, label('finance-transactions', 'amount'))).toMatchObject({ style: 3,
type: null,
value: '1234.56' });
        expect(cellOf(dados, 'Nº')).toMatchObject({ style: 0,
value: '12' });
        const date = cellOf(dados, 'Data')!;
        expect(date.style).toBe(4);
        expect(serialToIso(date.value)).toBe('2026-05-10 00:00');
        // O documento só com dígitos continua texto.
        expect(cellOf(dados, 'CNPJ / CPF')).toMatchObject({ style: 2,
value: '12345678000190' });
        expect(cellOf(dados, 'Descrição')).toMatchObject({ style: 2,
value: '+CompraSuspeita',
formula: false });
    });
});

describe('relatório de cadastros em Excel', () => {
    it('uma aba por seção, com o padrão de cada fonte; a auditoria diz Excel', async () => {
        vi.mocked(repo.companies).mockResolvedValue([] as never);
        vi.mocked(repo.admins).mockResolvedValue([] as never);
        const r = await useCase().execute('cadastros', { format: 'xlsx' });
        expect(r.result).toMatchObject({
            format: 'xlsx',
            count: 2,
            filename: 'relatorio-de-cadastros-2026-09-17.xlsx',
            auditLabel: 'Relatório de cadastros: 2 registros (todos) · Excel',
            auditDetails: null,
        });
        const { sheets } = readXlsx(r.result!.xlsx!);
        expect(sheets.map(s => s.name)).toEqual(['Pessoas físicas', 'Associados em dia', 'Pessoas jurídicas', 'Administradores', 'Sobre']);
        expect(sheets[0].rows[0]).toHaveLength(EXPORT_SOURCES.people.padrao.length);
        expect(sheets[0].rows).toHaveLength(2);
        expect(sheets[2].rows).toEqual([EXPORT_SOURCES.companies.padrao.map(k => EXPORT_SOURCES.companies.fields.find(f => f.key === k)!.label)]);
        expect(sheets[4].rows.find(([k]) => k === 'Pessoas físicas')).toEqual(['Pessoas físicas', '1']);
    });

    it('fields e PDF continuam 400', async () => {
        for (const input of [{ fields: 'name',
format: 'xlsx' }, { format: 'pdf' }]) {
            expect((await useCase().execute('cadastros', input)).error!.message).toBe('Este conjunto ainda não tem o montador.');
        }
    });
});

describe('peças do Excel', () => {
    it('Brasília: o instante vira a hora de parede (UTC−3)', () => {
        expect(brasiliaWallClock(new Date('2026-01-02T02:10:05Z')).toISOString()).toBe('2026-01-01T23:10:05.000Z');
    });

    it('largura: o maior entre cabeçalho e conteúdo, de 8 a 60; assinatura larga', () => {
        expect(columnWidth('UF', 'text', [{ kind: 'text',
value: 'PR' }])).toBe(8);
        expect(columnWidth('Nome', 'text', [{ kind: 'text',
value: 'JOÃO DA SILVA' }])).toBe(15);
        expect(columnWidth('Obs', 'text', [{ kind: 'text',
value: 'x'.repeat(500) }])).toBe(60);
        expect(columnWidth('Valor', 'money', [{ kind: 'money',
value: 1234.5 }])).toBe(13);
        expect(columnWidth('Assinatura', 'blank', [null])).toBe(32);
        // Texto com quebra de linha conta a maior linha.
        expect(columnWidth('A', 'text', [{ kind: 'text',
value: 'curta\numa linha bem maior' }])).toBe(21);
    });
});
