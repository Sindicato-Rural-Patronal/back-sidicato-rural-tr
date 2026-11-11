import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExportDataUseCase } from '../export-data.js';
import type { ExportRepository } from '../../ports/external/export-repository.js';

// Teste de ouro (decisão 006, item 8): o CSV padrão de `people`, `registrations`
// e do relatório de cadastros, byte a byte, com dados fixos. Foi escrito ANTES
// do montador de relatórios: o padrão (sem `fields`) tem de continuar
// exatamente igual. Se este teste quebrar, a planilha de hoje mudou.
//
// As linhas esperadas estão escritas à mão, célula por célula, já como saem no
// arquivo (aspas internas dobradas, fórmula com apóstrofo). Nada de snapshot em
// arquivo: o `core.autocrlf` trocaria o "\r\n" na ida e volta do git.

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
    roomBookings: vi.fn(),
    logExport: vi.fn(),
} as unknown as ExportRepository;

// 17/09/2026 10:00 em Brasília.
const now = () => new Date('2026-09-17T13:00:00.000Z');

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
    notes: null,
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

const emptyPerson = {
    nickname: null,
    cpf: null,
    rg: null,
    rgIssuer: null,
    rgIssuedAt: null,
    birthDate: null,
    gender: null,
    maritalStatus: null,
    nationality: null,
    birthPlace: null,
    ethnicity: null,
    educationLevel: null,
    specialNeeds: false,
    driverLicense: null,
    driverLicenseCategory: null,
    email: null,
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
    memberNotes: null,
    boardMember: false,
    boardPosition: null,
    primaryPropertyId: null,
    properties: [],
    companyMemberships: [],
    relations: [],
    userAdmin: null,
    userInstructor: null,
    unimed: null,
    publicContact: null,
    _count: { courseUserRegistration: 0 },
};

/** Tudo preenchido: máscaras, listas, aspas, ";" e fórmula. */
const joao = {
    ...emptyPerson,
    id: 'p1',
    name: 'JOÃO DA SILVA',
    nickname: '-1+1',
    cpf: '12345678909',
    rg: '1234567',
    rgIssuer: 'SSP/PR',
    rgIssuedAt: d('2000-03-04T00:00:00.000Z'),
    birthDate: d('1980-05-10T00:00:00.000Z'),
    gender: 'MALE',
    maritalStatus: 'MARRIED',
    nationality: 'BRASILEIRA',
    birthPlace: 'TERRA ROXA',
    ethnicity: 'MIXED',
    educationLevel: 'COMPLETE_SECONDARY',
    specialNeeds: true,
    driverLicense: '01234567890',
    driverLicenseCategory: 'AB',
    email: 'joao@test.com',
    phone: '44999990000',
    phone2: '(44) 3645-1234',
    phone3: '+55 44 99999-1111',
    memberType: 'PRODUTOR RURAL',
    memberClassification: 'PEQUENO',
    functionalCategory: 'PROPRIETARIO',
    familyIncome: 'ATE 3 SALARIOS',
    cadPro: ['111', '222'],
    memberStatus: 'ACTIVE',
    memberSince: d('2010-01-15T00:00:00.000Z'),
    // Validade vale o dia inteiro: hoje ainda está em dia.
    membershipValidUntil: d('2026-09-17T00:00:00.000Z'),
    memberNotesNumber: '42',
    memberNotes: '=cmd|calc',
    boardMember: true,
    boardPosition: 'TESOUREIRO',
    primaryPropertyId: 'prop2',
    createdAt: d('2026-01-02T15:30:00.000Z'),
    updatedAt: d('2026-03-04T02:05:00.000Z'),
    properties: [
        { id: 'prop1',
name: 'SITIO A',
registration: null,
address: ruralAddress },
        { id: 'prop2',
name: 'SEDE',
registration: '99',
address: urbanAddress },
    ],
    companyMemberships: [
        { title: 'SOCIO',
company: { name: 'AGRO LTDA',
tradeName: 'AGRO' } },
        { title: 'GERENTE',
company: { name: 'COOP "UNIÃO"',
tradeName: null } },
    ],
    relations: [
        { label: 'FILHO',
target: { name: 'PEDRO' } },
        { label: null,
target: { name: 'MARIA' } },
    ],
    userAdmin: { username: 'joao',
isDeleted: false },
    userInstructor: { id: 'i1' },
    unimed: { plano: 'ENFERMARIA',
isDeleted: false },
    publicContact: { title: 'PRESIDENTE' },
    _count: { courseUserRegistration: 3 },
};

/** Quase tudo vazio: o que sai quando não há dado. */
const maria = {
    ...emptyPerson,
    id: 'p2',
    name: 'MARIA SEM DADOS',
    phone: '4433334444',
    createdAt: d('2026-09-16T23:30:00.000Z'),
    updatedAt: d('2026-09-16T23:30:00.000Z'),
    userAdmin: { username: 'antiga',
isDeleted: true },
    unimed: { plano: null,
isDeleted: false },
    publicContact: { title: null },
};

/** Casos de borda: CPF incompleto, validade vencida, propriedade sem endereço. */
const ana = {
    ...emptyPerson,
    id: 'p3',
    name: 'ANA "ANINHA"; BRAGA',
    cpf: '123.456',
    gender: 'OTHER',
    ethnicity: 'INDIGENOUS',
    educationLevel: 'POSTGRADUATE',
    maritalStatus: 'DOMESTIC_PARTNERSHIP',
    phone: '44 98888-7777',
    memberStatus: 'ACTIVE',
    membershipValidUntil: d('2026-09-16T00:00:00.000Z'),
    memberNotes: 'linha 1\nlinha 2',
    properties: [{ id: 'prop3',
name: 'SITIO C',
registration: '7',
address: null }],
    unimed: { plano: 'APARTAMENTO',
isDeleted: true },
    createdAt: d('2025-12-31T12:00:00.000Z'),
    updatedAt: d('2026-01-01T02:59:00.000Z'),
};

const PEOPLE_HEADER = [
    'Nome', 'Apelido', 'CPF', 'RG', 'Órgão emissor', 'Emissão do RG', 'Nascimento', 'Sexo', 'Estado civil',
    'Nacionalidade', 'Naturalidade', 'Etnia', 'Escolaridade', 'Necessidades especiais', 'CNH', 'Categoria CNH',
    'E-mail', 'Telefone', 'Telefone 2', 'Telefone 3',
    'Tipo de membro', 'Classificação', 'Categoria funcional', 'Renda familiar', 'CAD/PRO', 'Situação de associado',
    'Associado em dia', 'Associado desde', 'Associado até', 'Nº da observação', 'Observações', 'Diretoria',
    'Cargo na diretoria',
    'Propriedade principal',
    'Endereço: Tipo', 'Endereço: Rua', 'Endereço: Número', 'Endereço: Complemento', 'Endereço: Bairro',
    'Endereço: Localidade', 'Endereço: Estrada', 'Endereço: Km', 'Endereço: Lote', 'Endereço: Seção',
    'Endereço: Cidade', 'Endereço: UF', 'Endereço: CEP',
    'Todas as propriedades', 'Empresas vinculadas', 'Relacionamentos', 'Instrutor', 'Usuário do painel', 'Unimed',
    'Contato público', 'Inscrições em cursos', 'Cadastrado em', 'Atualizado em',
];

const JOAO_ROW = [
    'JOÃO DA SILVA', `'-1+1`, '123.456.789-09', '1234567', 'SSP/PR', '04/03/2000', '10/05/1980', 'Masculino', 'Casado(a)',
    'BRASILEIRA', 'TERRA ROXA', 'Parda', 'Médio completo', 'Sim', '01234567890', 'AB',
    'joao@test.com', '44999990000', '(44) 3645-1234', `'+55 44 99999-1111`,
    'PRODUTOR RURAL', 'PEQUENO', 'PROPRIETARIO', 'ATE 3 SALARIOS', '111 | 222', 'Ativo',
    'Sim', '15/01/2010', '17/09/2026', '42', `'=cmd|calc`, 'Sim',
    'TESOUREIRO',
    'SEDE',
    'Urbano', 'RUA X', '10', 'SALA 2; FUNDOS', 'CENTRO',
    '', '', '', '', '',
    'TERRA ROXA', 'PR', '85990-000',
    'SITIO A: ESTRADA BOIADEIRA - AGUA DO SOL, km 12, lote 7, seção B - TERRA ROXA/PR - 85990-000'
        + ' | SEDE (matrícula 99): RUA X, 10 - SALA 2; FUNDOS - CENTRO - TERRA ROXA/PR - 85990-000',
    'AGRO (SOCIO) | COOP ""UNIÃO"" (GERENTE)', 'PEDRO (FILHO) | MARIA', 'Sim', 'joao', 'ENFERMARIA',
    'PRESIDENTE', '3', '02/01/2026 12:30', '03/03/2026 23:05',
];

const MARIA_ROW = [
    'MARIA SEM DADOS', '', '', '', '', '', '', '', '',
    '', '', '', '', 'Não', '', '',
    '', '4433334444', '', '',
    '', '', '', '', '', '',
    'Não', '', '', '', '', 'Não',
    '',
    '',
    '', '', '', '', '',
    '', '', '', '', '',
    '', '', '',
    '', '', '', 'Não', '', 'Sim',
    'Sim', '0', '16/09/2026 20:30', '16/09/2026 20:30',
];

const ANA_ROW = [
    'ANA ""ANINHA""; BRAGA', '', '123456', '', '', '', '', 'Outro', 'União estável',
    '', '', 'Indígena', 'Pós-graduação', 'Não', '', '',
    '', '44 98888-7777', '', '',
    '', '', '', '', '', 'Ativo',
    'Não', '', '16/09/2026', '', 'linha 1\nlinha 2', 'Não',
    '',
    'SITIO C',
    '', '', '', '', '',
    '', '', '', '', '',
    '', '', '',
    'SITIO C (matrícula 7)', '', '', 'Não', '', '',
    '', '0', '31/12/2025 09:00', '31/12/2025 23:59',
];

describe('teste de ouro: CSV padrão de pessoas', () => {
    beforeEach(() => vi.clearAllMocks());

    it('57 colunas, na ordem e no formato de hoje', async () => {
        expect(PEOPLE_HEADER).toHaveLength(57);
        expect(JOAO_ROW).toHaveLength(57);
        expect(MARIA_ROW).toHaveLength(57);
        expect(ANA_ROW).toHaveLength(57);

        vi.mocked(repo.people).mockResolvedValue([joao, maria, ana] as never);
        const r = await new ExportDataUseCase(repo, now).execute('people', {});
        expect(r.error).toBeUndefined();
        expect(r.result!.csv).toBe(file(PEOPLE_HEADER, JOAO_ROW, MARIA_ROW, ANA_ROW));
        expect(r.result!.count).toBe(3);
        expect(r.result!.filename).toBe('pessoas-2026-09-17.csv');
    });

    it('um registro pelo id: mesmo arquivo, nome da pessoa no nome do arquivo', async () => {
        vi.mocked(repo.people).mockResolvedValue([joao] as never);
        const r = await new ExportDataUseCase(repo, now).execute('people', { ids: ['p1'] });
        expect(r.result!.csv).toBe(file(PEOPLE_HEADER, JOAO_ROW));
        expect(r.result!.filename).toBe('pessoa-joao-da-silva-2026-09-17.csv');
    });

    it('lista vazia: só o cabeçalho', async () => {
        vi.mocked(repo.people).mockResolvedValue([] as never);
        const r = await new ExportDataUseCase(repo, now).execute('people', { search: 'ninguém' });
        expect(r.result!.csv).toBe(file(PEOPLE_HEADER));
        expect(r.result!.count).toBe(0);
    });
});

const REGISTRATIONS_HEADER = [
    'Curso', 'Nº do evento', 'Início do curso', 'Nome', 'CPF', 'E-mail', 'Telefone', 'Nascimento', 'Idade',
    'Confirmada', 'Presença', 'Associado em dia', 'Empresa parceira', 'Cargo na diretoria', 'Contato público',
    'Ficha anexada', 'Inscrito em',
];

const registrationPerson = {
    name: 'JOÃO DA SILVA',
    cpf: '12345678909',
    email: 'joao@test.com',
    phone: '44999990000',
    // Faz aniversário amanhã: ainda tem 45.
    birthDate: d('1980-09-18T00:00:00.000Z'),
    memberStatus: 'ACTIVE',
    membershipValidUntil: null,
    boardPosition: 'TESOUREIRO',
    publicContact: { title: null },
    companyMemberships: [
        { company: { name: 'AGRO LTDA',
tradeName: 'AGRO' } },
        { company: { name: 'COOP',
tradeName: null } },
    ],
};

const registrations = [
    {
        id: 'r1',
        confirmed: true,
        attended: true,
        createdAt: d('2026-09-01T12:00:00.000Z'),
        ficha: { id: 'f1' },
        course: { name: 'HORTA "ORGÂNICA"',
eventNumber: '2026/15',
startTime: d('2026-10-05T08:00:00.000Z') },
        userData: registrationPerson,
    },
    {
        id: 'r2',
        confirmed: false,
        attended: false,
        createdAt: d('2026-09-16T23:30:00.000Z'),
        ficha: null,
        course: { name: 'CURSO B',
eventNumber: null,
startTime: d('2026-11-30T19:30:00.000Z') },
        userData: {
            name: 'MARIA',
            cpf: null,
            email: null,
            phone: '=2+2',
            // Aniversário hoje: já fez 26.
            birthDate: d('2000-09-17T00:00:00.000Z'),
            memberStatus: 'INACTIVE',
            membershipValidUntil: null,
            boardPosition: null,
            publicContact: null,
            companyMemberships: [],
        },
    },
    {
        id: 'r3',
        confirmed: true,
        attended: null,
        createdAt: d('2026-09-17T02:59:00.000Z'),
        ficha: null,
        course: { name: 'CURSO B',
eventNumber: null,
startTime: d('2026-11-30T19:30:00.000Z') },
        userData: {
            name: 'ANA',
            cpf: '52998224725',
            email: 'ana@test.com',
            phone: '(44) 9 8888-7777',
            birthDate: null,
            memberStatus: 'ACTIVE',
            membershipValidUntil: d('2026-09-16T00:00:00.000Z'),
            boardPosition: null,
            publicContact: { title: 'SECRETÁRIA' },
            companyMemberships: [],
        },
    },
];

describe('teste de ouro: CSV padrão de inscrições', () => {
    beforeEach(() => vi.clearAllMocks());

    it('17 colunas, na ordem e no formato de hoje', async () => {
        vi.mocked(repo.registrations).mockResolvedValue(registrations as never);
        const r = await new ExportDataUseCase(repo, now).execute('registrations', { courseIds: ['c1', 'c2'] });
        expect(r.error).toBeUndefined();
        expect(r.result!.csv).toBe(
            file(
                REGISTRATIONS_HEADER,
                [
                    'HORTA ""ORGÂNICA""', '2026/15', '05/10/2026 08:00', 'JOÃO DA SILVA', '123.456.789-09',
                    'joao@test.com', '44999990000', '18/09/1980', '45', 'Sim', 'Presente', 'Sim', 'AGRO | COOP',
                    'TESOUREIRO', 'Sim', 'Sim', '01/09/2026 09:00',
                ],
                [
                    'CURSO B', '', '30/11/2026 19:30', 'MARIA', '', '', `'=2+2`, '17/09/2000', '26', 'Não', 'Faltou',
                    'Não', '', '', '', 'Não', '16/09/2026 20:30',
                ],
                [
                    'CURSO B', '', '30/11/2026 19:30', 'ANA', '529.982.247-25', 'ana@test.com', '(44) 9 8888-7777', '',
                    '', 'Sim', '', 'Não', '', '', 'SECRETÁRIA', 'Não', '16/09/2026 23:59',
                ],
            ),
        );
        expect(r.result!.count).toBe(3);
        expect(r.result!.filename).toBe('inscricoes-2026-09-17.csv');
    });
});

describe('teste de ouro: relatório de cadastros (usa as colunas de pessoas)', () => {
    beforeEach(() => vi.clearAllMocks());

    it('quatro seções, cada uma com título e cabeçalho', async () => {
        vi.mocked(repo.people).mockImplementation((async (q: { activeMember?: boolean }) =>
            q.activeMember ? [joao] : [joao, maria]) as never);
        vi.mocked(repo.companies).mockResolvedValue([] as never);
        vi.mocked(repo.admins).mockResolvedValue([
            {
                id: 'a1',
                username: 'joao',
                createdAt: d('2026-02-01T10:00:00.000Z'),
                userData: { name: 'JOÃO DA SILVA',
email: 'joao@test.com',
cpf: '12345678909',
phone: '44999990000' },
                rules: { name: 'TOTAL' },
            },
        ] as never);
        const r = await new ExportDataUseCase(repo, now).execute('cadastros', {});
        expect(r.result!.csv).toBe(
            BOM
                + line(['PESSOAS FISICAS']) + line(PEOPLE_HEADER) + line(JOAO_ROW) + line(MARIA_ROW)
                + '\r\n'
                + line(['ASSOCIADOS EM DIA']) + line(PEOPLE_HEADER) + line(JOAO_ROW)
                + '\r\n'
                + line(['PESSOAS JURIDICAS'])
                + line([
                    'Razão social', 'Nome fantasia', 'CNPJ', 'Inscrição estadual', 'Tipo', 'E-mail', 'Telefone',
                    'Telefone 2', 'Telefone 3', 'Site', 'Sede: Tipo', 'Sede: Rua', 'Sede: Número', 'Sede: Complemento',
                    'Sede: Bairro', 'Sede: Localidade', 'Sede: Estrada', 'Sede: Km', 'Sede: Lote', 'Sede: Seção',
                    'Sede: Cidade', 'Sede: UF', 'Sede: CEP', 'Pessoas vinculadas', 'Propriedades', 'Parceira',
                    'Link da parceria', 'Observações', 'Cadastrada em', 'Atualizada em',
                ])
                + '\r\n'
                + line(['ADMINISTRADORES'])
                + line(['Usuário', 'Nome', 'E-mail', 'CPF', 'Telefone', 'Regra de acesso', 'Criado em'])
                + line(['joao', 'JOÃO DA SILVA', 'joao@test.com', '123.456.789-09', '44999990000', 'TOTAL', '01/02/2026 07:00']),
        );
        expect(r.result!.count).toBe(2 + 1 + 0 + 1);
    });
});
