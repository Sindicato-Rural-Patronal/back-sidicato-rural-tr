import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExportDataUseCase } from '../export-data.js';
import type { ExportRepository } from '../../ports/external/export-repository.js';
import { ValidationError } from '../../errors/validation.js';
import { csvDate, csvDateTime, toCsv } from '../../lib/csv.js';

const repo = {
    people: vi.fn(),
    companies: vi.fn(),
    properties: vi.fn(),
    admins: vi.fn(),
    courses: vi.fn(),
    registrations: vi.fn(),
    contactMessages: vi.fn(),
    unimed: vi.fn(),
    auditLogs: vi.fn(),
    logExport: vi.fn(),
} as unknown as ExportRepository;

// 17/09/2026 10:00 em Brasília.
const now = () => new Date('2026-09-17T13:00:00.000Z');

/** Tira o BOM e separa linhas/células (as células vêm sempre entre aspas). */
function parse(csv: string): string[][] {
    return csv
        .replace(/^﻿/, '')
        .trim()
        .split('\r\n')
        .map(line => line.slice(1, -1).split('";"'));
}

function person(overrides: Record<string, unknown> = {}) {
    return {
        id: 'p1',
        name: 'JOÃO DA SILVA',
        nickname: null,
        cpf: '12345678909',
        rg: '1234567',
        rgIssuer: 'SSP/PR',
        rgIssuedAt: null,
        birthDate: new Date('1980-05-10T00:00:00.000Z'),
        gender: 'MALE',
        maritalStatus: 'MARRIED',
        nationality: 'BRASILEIRA',
        birthPlace: 'TERRA ROXA',
        ethnicity: null,
        educationLevel: 'COMPLETE_SECONDARY',
        specialNeeds: false,
        driverLicense: null,
        driverLicenseCategory: null,
        email: 'joao@test.com',
        phone: '44999990000',
        phone2: null,
        phone3: null,
        memberType: 'PRODUTOR RURAL',
        memberClassification: null,
        functionalCategory: null,
        familyIncome: null,
        cadPro: ['111', '222'],
        memberStatus: 'ACTIVE',
        memberSince: null,
        membershipValidUntil: new Date('2026-09-17T00:00:00.000Z'),
        memberNotesNumber: null,
        memberNotes: '=cmd|calc',
        boardMember: false,
        boardPosition: null,
        primaryPropertyId: 'prop2',
        createdAt: new Date('2026-01-02T15:30:00.000Z'),
        updatedAt: new Date('2026-01-02T15:30:00.000Z'),
        properties: [
            { id: 'prop1',
name: 'SITIO A',
registration: null,
address: null },
            {
                id: 'prop2',
                name: 'SEDE',
                registration: '99',
                address: {
                    type: 'URBAN',
street: 'RUA X',
number: '10',
complement: null,
neighborhood: 'CENTRO',
                    localityName: null,
road: null,
km: null,
lot: null,
section: null,
                    city: 'TERRA ROXA',
state: 'PR',
zipCode: '85990000',
notes: null,
                },
            },
        ],
        companyMemberships: [{ title: 'SOCIO',
company: { name: 'AGRO LTDA',
tradeName: 'AGRO' } }],
        relations: [{ label: 'FILHO',
target: { name: 'PEDRO' } }],
        userAdmin: null,
        userInstructor: null,
        unimed: null,
        publicContact: null,
        _count: { courseUserRegistration: 2 },
        ...overrides,
    };
}

describe('toCsv', () => {
    it('BOM, ";" e aspas; neutraliza fórmula; datas em pt-BR', () => {
        const csv = toCsv(
            [
                { header: 'Texto',
value: (r: { t: string }) => r.t },
                { header: 'Número',
value: () => 1.5 },
                { header: 'Sim/Não',
value: () => true },
            ],
            [{ t: 'a "b"; c' }, { t: '+55 44' }, { t: '@SOMA(1)' }],
        );
        expect(csv.startsWith('﻿"Texto";"Número";"Sim/Não"\r\n')).toBe(true);
        expect(csv).toContain('"a ""b""; c";"1,5";"Sim"');
        expect(csv).toContain(`"'+55 44"`);
        expect(csv).toContain(`"'@SOMA(1)"`);
        expect(csvDate(new Date('2026-09-17T00:00:00.000Z'))).toBe('17/09/2026');
        expect(csvDateTime(new Date('2026-09-17T13:05:00.000Z'))).toBe('17/09/2026 10:05');
    });
});

describe('ExportDataUseCase', () => {
    beforeEach(() => vi.clearAllMocks());

    it('CPF sempre no formato 000.000.000-00, venha com ou sem máscara', async () => {
        vi.mocked(repo.people).mockResolvedValue([
            person({ id: 'a',
cpf: '12345678909' }),
            person({ id: 'b',
cpf: '123.456.789-09' }),
            person({ id: 'c',
cpf: '123.456' }),
            person({ id: 'd',
cpf: null }),
        ] as never);
        const r = await new ExportDataUseCase(repo, now).execute('people', {});
        const [header, ...rows] = parse(r.result!.csv);
        expect(rows.map(row => row[header.indexOf('CPF')])).toEqual(['123.456.789-09', '123.456.789-09', '123456', '']);
    });

    it('pessoas: colunas legíveis, endereço da propriedade principal e fórmula neutralizada', async () => {
        vi.mocked(repo.people).mockResolvedValue([person()] as never);
        const r = await new ExportDataUseCase(repo, now).execute('people', { search: 'joão',
gender: '' });
        const filters = vi.mocked(repo.people).mock.calls[0][0];
        expect(filters.search).toBe('joão');
        expect(filters.gender).toBeUndefined();
        expect(filters.ids).toBeUndefined();

        const [header, row] = parse(r.result!.csv);
        const cell = (name: string) => row[header.indexOf(name)];
        expect(cell('CPF')).toBe('123.456.789-09');
        expect(cell('Sexo')).toBe('Masculino');
        expect(cell('Estado civil')).toBe('Casado(a)');
        expect(cell('CAD/PRO')).toBe('111 | 222');
        expect(cell('Associado em dia')).toBe('Sim'); // validade vale o dia inteiro
        expect(cell('Observações')).toBe(`'=cmd|calc`);
        expect(cell('Propriedade principal')).toBe('SEDE');
        expect(cell('Endereço: Cidade')).toBe('TERRA ROXA');
        expect(cell('Endereço: CEP')).toBe('85990-000');
        expect(cell('Todas as propriedades')).toBe('SITIO A | SEDE (matrícula 99): RUA X, 10 - CENTRO - TERRA ROXA/PR - 85990-000');
        expect(cell('Empresas vinculadas')).toBe('AGRO (SOCIO)');
        expect(cell('Relacionamentos')).toBe('PEDRO (FILHO)');
        expect(cell('Nascimento')).toBe('10/05/1980');

        expect(r.result).toMatchObject({ count: 1,
filename: 'pessoas-2026-09-17.csv',
auditLabel: 'Pessoas: 1 registro (com filtros)' });
    });

    it('um registro pelo id: nome no arquivo e na auditoria', async () => {
        vi.mocked(repo.people).mockResolvedValue([person()] as never);
        const r = await new ExportDataUseCase(repo, now).execute('people', { ids: 'p1' });
        expect(repo.people).toHaveBeenCalledWith(expect.objectContaining({ ids: ['p1'] }));
        expect(r.result).toMatchObject({ filename: 'pessoa-joao-da-silva-2026-09-17.csv',
auditLabel: 'Pessoas: JOÃO DA SILVA' });
    });

    it('seleção de vários ids e lista vazia só com cabeçalho', async () => {
        vi.mocked(repo.companies).mockResolvedValue([] as never);
        const r = await new ExportDataUseCase(repo, now).execute('companies', { ids: 'a, b ,,c' });
        expect(repo.companies).toHaveBeenCalledWith(expect.objectContaining({ ids: ['a', 'b', 'c'] }));
        expect(parse(r.result!.csv)).toHaveLength(1);
        expect(r.result!.auditLabel).toBe('Empresas: 0 registros (seleção)');
    });

    it('filtro inválido é 400', async () => {
        const r = await new ExportDataUseCase(repo, now).execute('companies', { type: 'MISTA' });
        expect(r.error).toBeInstanceOf(ValidationError);
        expect(repo.companies).not.toHaveBeenCalled();
    });

    it('auditoria traduz a ação', async () => {
        vi.mocked(repo.auditLogs).mockResolvedValue([
            { id: '1',
method: 'EXPORT',
path: '/admin/export/people',
entity: 'Exportação',
targetLabel: 'Pessoas: 3 registros (todos)',
createdAt: new Date('2026-09-17T13:00:00.000Z'),
actorName: 'bali' },
        ] as never);
        const r = await new ExportDataUseCase(repo, now).execute('audit-logs', { action: 'export' });
        expect(repo.auditLogs).toHaveBeenCalledWith(expect.objectContaining({ action: 'export' }));
        const [, row] = parse(r.result!.csv);
        expect(row).toEqual(['17/09/2026 10:00', 'bali', 'Exportou uma planilha', 'Exportação', 'Pessoas: 3 registros (todos)', '/admin/export/people', '', '', '', '']);
    });

    it('auditoria traz IP, local, aparelho e o que mudou', async () => {
        vi.mocked(repo.auditLogs).mockResolvedValue([
            { id: '2',
method: 'PATCH',
path: '/users/x',
entity: 'Usuário',
targetLabel: 'JOÃO',
createdAt: new Date('2026-09-17T13:00:00.000Z'),
actorName: 'bali',
ip: '200.1.2.3',
location: 'Terra Roxa, PR, Brasil',
userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
changes: [{ field: 'email',
before: 'a@x.com',
after: null }, { field: 'phone',
before: '44999990000',
after: '44988880000' }] },
        ] as never);
        const r = await new ExportDataUseCase(repo, now).execute('audit-logs', { action: 'login_failed',
ip: '200.1.2.3' });
        expect(r.error).toBeUndefined();
        expect(repo.auditLogs).toHaveBeenCalledWith(expect.objectContaining({ action: 'login_failed',
ip: '200.1.2.3' }));
        const [header, row] = parse(r.result!.csv);
        expect(header.slice(-4)).toEqual(['IP', 'Local', 'Aparelho', 'Alterações']);
        expect(row.slice(-4)).toEqual([
            '200.1.2.3',
            'Terra Roxa, PR, Brasil',
            'Chrome no Windows',
            'E-mail: a@x.com → (vazio); Telefone: 44999990000 → 44988880000',
        ]);
    });
});
