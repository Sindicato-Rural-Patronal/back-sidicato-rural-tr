import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExportDataUseCase } from '../export-data.js';
import type { ExportRepository } from '../../ports/external/export-repository.js';

// Teste de ouro da fase 2 do montador de relatórios (decisão 006, item 8): o
// CSV padrão de cada fonte que passa para o motor, byte a byte, com dados
// fixos. Cada bloco foi escrito e commitado ANTES de a fonte dele sair do
// caminho antigo (`export-data.ts`): sem `fields`, a planilha tem de continuar
// exatamente igual. Se um bloco quebrar, a planilha de hoje mudou.
//
// Como no teste de ouro da fase 1, as linhas esperadas estão escritas à mão,
// célula por célula, já como saem no arquivo (aspas internas dobradas,
// fórmula com apóstrofo). Nada de snapshot em arquivo (o `core.autocrlf`
// trocaria o "\r\n").

const repo = {
    people: vi.fn(),
    companies: vi.fn(),
    properties: vi.fn(),
    admins: vi.fn(),
    courses: vi.fn(),
    registrations: vi.fn(),
    courseNames: vi.fn(),
    contactMessages: vi.fn(),
    unimed: vi.fn(),
    auditLogs: vi.fn(),
    roomBookings: vi.fn(),
    logExport: vi.fn(),
} as unknown as ExportRepository;

// 17/09/2026 10:00 em Brasília.
const now = () => new Date('2026-09-17T13:00:00.000Z');
const useCase = () => new ExportDataUseCase(repo, now);

const BOM = '﻿';
/** Uma linha do arquivo: cada célula entre aspas, separadas por ";". */
const line = (cells: string[]) => `${cells.map(c => `"${c}"`).join(';')}\r\n`;
const file = (...lines: string[][]) => BOM + lines.map(line).join('');

const d = (iso: string) => new Date(iso);

const ruralAddress = {
    type: 'RURAL',
    street: null,
    number: null,
    complement: null,
    neighborhood: null,
    localityName: 'AGUA DO SOL',
    road: 'ESTRADA BOIADEIRA',
    km: '12',
    lot: '7',
    section: 'B',
    city: 'TERRA ROXA',
    state: 'PR',
    zipCode: '85990000',
    notes: 'PERTO DO RIO',
};

const urbanAddress = {
    type: 'URBAN',
    street: 'RUA X',
    number: '10',
    complement: 'SALA 2; FUNDOS',
    neighborhood: 'CENTRO',
    localityName: null,
    road: null,
    km: null,
    lot: null,
    section: null,
    city: 'TERRA ROXA',
    state: 'PR',
    zipCode: '85990000',
    notes: 'PORTÃO AZUL',
};

/** As 13 colunas de endereço vazias. */
const NO_ADDRESS = ['', '', '', '', '', '', '', '', '', '', '', '', ''];
const URBAN_CELLS = ['Urbano', 'RUA X', '10', 'SALA 2; FUNDOS', 'CENTRO', '', '', '', '', '', 'TERRA ROXA', 'PR', '85990-000'];
const ADDRESS_HEADERS = ['Tipo', 'Rua', 'Número', 'Complemento', 'Bairro', 'Localidade', 'Estrada', 'Km', 'Lote', 'Seção', 'Cidade', 'UF', 'CEP'];

beforeEach(() => vi.clearAllMocks());

// ── Empresas ─────────────────────────────────────────────────────────────────

const COMPANIES_HEADER = [
    'Razão social', 'Nome fantasia', 'CNPJ', 'Inscrição estadual', 'Tipo', 'E-mail', 'Telefone', 'Telefone 2',
    'Telefone 3', 'Site', ...ADDRESS_HEADERS.map(h => `Sede: ${h}`), 'Pessoas vinculadas', 'Propriedades', 'Parceira',
    'Link da parceria', 'Observações', 'Cadastrada em', 'Atualizada em',
];

/** Tudo preenchido: máscara, sede, listas, aspas, ";" e fórmula. */
const agro = {
    id: 'c1',
    name: 'AGRO "BOA" LTDA',
    tradeName: 'AGRO BOA',
    cnpj: '11222333000181',
    stateRegistration: '123.456',
    type: 'PRIVATE',
    email: 'agro@test.com',
    phone: '4436451234',
    phone2: '(44) 99999-0000',
    phone3: '+55 44 3333-2222',
    website: 'https://agro.test',
    notes: '=HYPERLINK("x")',
    isPartner: true,
    partnerUrl: 'https://agro.test/parceria',
    createdAt: d('2026-01-02T15:30:00.000Z'),
    updatedAt: d('2026-03-04T02:05:00.000Z'),
    address: urbanAddress,
    members: [
        { title: 'SOCIO',
userData: { name: 'JOÃO',
cpf: '12345678909' } },
        { title: 'GERENTE',
userData: { name: 'MARIA "M"',
cpf: null } },
    ],
    properties: [
        { id: 'pr1',
name: 'FAZENDA',
registration: '5',
address: ruralAddress },
        { id: 'pr2',
name: 'LOTE',
registration: null,
address: null },
    ],
};

/** Quase tudo vazio; CNPJ antigo, que não tem 14 dígitos, sai como gravado. */
const coop = {
    id: 'c2',
    name: 'COOP VAZIA',
    tradeName: null,
    cnpj: '12.345/0001',
    stateRegistration: null,
    type: 'PUBLIC',
    email: null,
    phone: null,
    phone2: null,
    phone3: null,
    website: null,
    notes: null,
    isPartner: false,
    partnerUrl: null,
    createdAt: d('2026-09-16T23:30:00.000Z'),
    updatedAt: d('2026-09-16T23:30:00.000Z'),
    address: null,
    members: [],
    properties: [],
};

const AGRO_ROW = [
    'AGRO ""BOA"" LTDA', 'AGRO BOA', '11.222.333/0001-81', '123.456', 'Privada', 'agro@test.com', '4436451234',
    '(44) 99999-0000', `'+55 44 3333-2222`, 'https://agro.test', ...URBAN_CELLS,
    'JOÃO (SOCIO) | MARIA ""M"" (GERENTE)',
    'FAZENDA (matrícula 5): ESTRADA BOIADEIRA - AGUA DO SOL, km 12, lote 7, seção B - TERRA ROXA/PR - 85990-000 | LOTE',
    'Sim', 'https://agro.test/parceria', `'=HYPERLINK(""x"")`, '02/01/2026 12:30', '03/03/2026 23:05',
];

const COOP_ROW = [
    'COOP VAZIA', '', '12.345/0001', '', 'Pública', '', '', '', '', '', ...NO_ADDRESS, '', '', 'Não', '', '',
    '16/09/2026 20:30', '16/09/2026 20:30',
];

describe('teste de ouro: CSV padrão de empresas', () => {
    it('30 colunas, na ordem e no formato de hoje', async () => {
        expect(COMPANIES_HEADER).toHaveLength(30);
        expect(AGRO_ROW).toHaveLength(30);
        expect(COOP_ROW).toHaveLength(30);

        vi.mocked(repo.companies).mockResolvedValue([agro, coop] as never);
        const r = await useCase().execute('companies', {});
        expect(r.error).toBeUndefined();
        expect(r.result!.csv).toBe(file(COMPANIES_HEADER, AGRO_ROW, COOP_ROW));
        expect(r.result!.count).toBe(2);
        expect(r.result!.filename).toBe('empresas-2026-09-17.csv');
    });

    it('uma empresa pelo id: mesmo arquivo, nome fantasia no nome do arquivo', async () => {
        vi.mocked(repo.companies).mockResolvedValue([agro] as never);
        const r = await useCase().execute('companies', { ids: ['c1'] });
        expect(r.result!.csv).toBe(file(COMPANIES_HEADER, AGRO_ROW));
        expect(r.result!.filename).toBe('empresa-agro-boa-2026-09-17.csv');
    });

    it('lista vazia: só o cabeçalho', async () => {
        vi.mocked(repo.companies).mockResolvedValue([] as never);
        const r = await useCase().execute('companies', { search: 'ninguém',
type: 'PUBLIC',
isPartner: 'true' });
        expect(r.result!.csv).toBe(file(COMPANIES_HEADER));
        expect(r.result!.count).toBe(0);
    });
});
