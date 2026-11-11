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
const RURAL_CELLS = ['Rural', '', '', '', '', 'AGUA DO SOL', 'ESTRADA BOIADEIRA', '12', '7', 'B', 'TERRA ROXA', 'PR', '85990-000'];
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

// ── Propriedades ─────────────────────────────────────────────────────────────

const PROPERTIES_HEADER = [
    'Propriedade', 'Matrícula', 'Dono', 'Nome do dono', 'CPF/CNPJ', 'Principal', ...ADDRESS_HEADERS,
    'Observações do endereço', 'Cadastrada em',
];

/** De pessoa, a principal dela. */
const sitio = {
    id: 'pr1',
    name: 'SITIO "A"',
    registration: '99',
    createdAt: d('2026-01-02T15:30:00.000Z'),
    address: ruralAddress,
    userData: { name: 'JOÃO',
cpf: '12345678909',
primaryPropertyId: 'pr1' },
    company: null,
};

/** De empresa, que não é a principal dela: o nome do dono é o nome fantasia. */
const sede = {
    id: 'pr2',
    name: 'SEDE',
    registration: null,
    createdAt: d('2026-09-16T23:30:00.000Z'),
    address: urbanAddress,
    userData: null,
    company: { name: 'AGRO LTDA',
tradeName: 'AGRO',
cnpj: '11222333000181',
primaryPropertyId: 'outra' },
};

/** De empresa sem nome fantasia nem CNPJ; nome e matrícula que viram fórmula. */
const lote = {
    id: 'pr3',
    name: '=LOTE',
    registration: '-5',
    createdAt: d('2025-12-31T12:00:00.000Z'),
    address: null,
    userData: null,
    company: { name: 'COOP',
tradeName: null,
cnpj: null,
primaryPropertyId: 'pr3' },
};

/** De pessoa sem CPF. */
const chacara = {
    id: 'pr4',
    name: 'CHACARA',
    registration: null,
    createdAt: d('2026-01-01T02:59:00.000Z'),
    address: { ...urbanAddress,
notes: null },
    userData: { name: 'MARIA',
cpf: null,
primaryPropertyId: null },
    company: null,
};

const SITIO_ROW = [
    'SITIO ""A""', '99', 'Pessoa', 'JOÃO', '123.456.789-09', 'Sim', ...RURAL_CELLS, 'PERTO DO RIO', '02/01/2026 12:30',
];
const SEDE_ROW = [
    'SEDE', '', 'Empresa', 'AGRO', '11.222.333/0001-81', 'Não', ...URBAN_CELLS, 'PORTÃO AZUL', '16/09/2026 20:30',
];
const LOTE_ROW = [`'=LOTE`, `'-5`, 'Empresa', 'COOP', '', 'Sim', ...NO_ADDRESS, '', '31/12/2025 09:00'];
const CHACARA_ROW = ['CHACARA', '', 'Pessoa', 'MARIA', '', 'Não', ...URBAN_CELLS, '', '31/12/2025 23:59'];

describe('teste de ouro: CSV padrão de propriedades', () => {
    it('21 colunas, na ordem e no formato de hoje', async () => {
        expect(PROPERTIES_HEADER).toHaveLength(21);
        for (const row of [SITIO_ROW, SEDE_ROW, LOTE_ROW, CHACARA_ROW]) expect(row).toHaveLength(21);

        vi.mocked(repo.properties).mockResolvedValue([sitio, sede, lote, chacara] as never);
        const r = await useCase().execute('properties', { ownerIds: ['u1', 'c1'] });
        expect(r.error).toBeUndefined();
        expect(r.result!.csv).toBe(file(PROPERTIES_HEADER, SITIO_ROW, SEDE_ROW, LOTE_ROW, CHACARA_ROW));
        expect(r.result!.count).toBe(4);
        expect(r.result!.filename).toBe('propriedades-2026-09-17.csv');
    });

    it('uma propriedade pelo id: o nome dela no nome do arquivo', async () => {
        vi.mocked(repo.properties).mockResolvedValue([sitio] as never);
        const r = await useCase().execute('properties', { ids: ['pr1'] });
        expect(r.result!.csv).toBe(file(PROPERTIES_HEADER, SITIO_ROW));
        expect(r.result!.filename).toBe('propriedade-sitio-a-2026-09-17.csv');
    });

    it('lista vazia: só o cabeçalho', async () => {
        vi.mocked(repo.properties).mockResolvedValue([] as never);
        const r = await useCase().execute('properties', { ownerIds: 'ninguem' });
        expect(r.result!.csv).toBe(file(PROPERTIES_HEADER));
    });
});

// ── Administradores ──────────────────────────────────────────────────────────

const ADMINS_HEADER = ['Usuário', 'Nome', 'E-mail', 'CPF', 'Telefone', 'Regra de acesso', 'Criado em'];

const adminJoao = {
    id: 'a1',
    username: 'joao',
    createdAt: d('2026-02-01T10:00:00.000Z'),
    userData: { name: 'JOÃO DA SILVA',
email: 'joao@test.com',
cpf: '12345678909',
phone: '44999990000' },
    rules: { name: 'TOTAL' },
};

/** Fórmula no usuário e no telefone, aspas e ";" no nome e na regra, CPF incompleto. */
const adminMaria = {
    id: 'a2',
    username: '=adm',
    createdAt: d('2026-09-16T23:30:00.000Z'),
    userData: { name: 'MARIA "M"',
email: null,
cpf: '123',
phone: '+55 44 9999' },
    rules: { name: 'SÓ CURSOS; LEITURA' },
};

const JOAO_ADMIN_ROW = ['joao', 'JOÃO DA SILVA', 'joao@test.com', '123.456.789-09', '44999990000', 'TOTAL', '01/02/2026 07:00'];
const MARIA_ADMIN_ROW = [`'=adm`, 'MARIA ""M""', '', '123', `'+55 44 9999`, 'SÓ CURSOS; LEITURA', '16/09/2026 20:30'];

describe('teste de ouro: CSV padrão de administradores', () => {
    it('7 colunas, na ordem e no formato de hoje', async () => {
        vi.mocked(repo.admins).mockResolvedValue([adminJoao, adminMaria] as never);
        const r = await useCase().execute('admins', { rulesId: 'r1' });
        expect(r.error).toBeUndefined();
        expect(r.result!.csv).toBe(file(ADMINS_HEADER, JOAO_ADMIN_ROW, MARIA_ADMIN_ROW));
        expect(r.result!.count).toBe(2);
        expect(r.result!.filename).toBe('administradores-2026-09-17.csv');
    });

    it('um administrador pelo id: o nome da pessoa no nome do arquivo', async () => {
        vi.mocked(repo.admins).mockResolvedValue([adminJoao] as never);
        const r = await useCase().execute('admins', { ids: ['a1'] });
        expect(r.result!.csv).toBe(file(ADMINS_HEADER, JOAO_ADMIN_ROW));
        expect(r.result!.filename).toBe('administrador-joao-da-silva-2026-09-17.csv');
    });

    it('lista vazia: só o cabeçalho', async () => {
        vi.mocked(repo.admins).mockResolvedValue([] as never);
        const r = await useCase().execute('admins', { search: 'ninguém' });
        expect(r.result!.csv).toBe(file(ADMINS_HEADER));
    });
});

// ── Cursos ───────────────────────────────────────────────────────────────────

const COURSES_HEADER = [
    'Curso', 'Nº do evento', 'Status', 'Início', 'Término', 'Inscrições até', 'Sala', 'Capacidade da sala',
    'Instrutores', 'Carga horária (h)', 'Valor (R$)', 'Mínimo de alunos', 'Inscritos', 'Confirmados',
    'Pré-inscritos', 'Lista de espera', 'Descrição', 'Observações', 'Criado em',
];

/** Tudo preenchido: horário de parede, dinheiro, listas, aspas, ";" e fórmula. */
const horta = {
    id: 'c1',
    name: 'HORTA "ORGÂNICA"',
    description: 'Aprenda; "na prática"',
    eventNumber: '2026/15',
    status: 'PUBLIC',
    startTime: d('2026-10-05T08:00:00.000Z'),
    endTime: d('2026-10-05T12:00:00.000Z'),
    registrationDeadline: d('2026-10-01T18:30:00.000Z'),
    workloadHours: 4,
    price: 1234.5,
    minStudents: 5,
    preEnrolled: 2,
    waitlist: 1,
    observations: '=obs',
    createdAt: d('2026-09-01T12:00:00.000Z'),
    room: { name: 'AUDITORIO',
maxCapacity: 50 },
    instructors: [
        { title: 'ENGENHEIRO',
instructor: { userData: { name: 'PEDRO' } } },
        { title: null,
instructor: { userData: { name: 'ANA' } } },
    ],
    courseUserRegistration: [{ confirmed: true }, { confirmed: false }, { confirmed: true }],
};

/** Quase tudo vazio ou zero. */
const cursoB = {
    id: 'c2',
    name: 'CURSO B',
    description: '',
    eventNumber: null,
    status: 'COMPLETED',
    startTime: d('2026-11-30T19:30:00.000Z'),
    endTime: d('2026-11-30T22:00:00.000Z'),
    registrationDeadline: null,
    workloadHours: 0,
    price: 0,
    minStudents: 0,
    preEnrolled: 0,
    waitlist: 0,
    observations: null,
    createdAt: d('2026-09-16T23:30:00.000Z'),
    room: { name: 'SALA 1',
maxCapacity: 10 },
    instructors: [],
    courseUserRegistration: [],
};

const HORTA_ROW = [
    'HORTA ""ORGÂNICA""', '2026/15', 'Público', '05/10/2026 08:00', '05/10/2026 12:00', '01/10/2026 18:30', 'AUDITORIO',
    '50', 'PEDRO (ENGENHEIRO) | ANA', '4', '1.234,50', '5', '3', '2', '2', '1', 'Aprenda; ""na prática""', `'=obs`,
    '01/09/2026 09:00',
];
const CURSO_B_ROW = [
    'CURSO B', '', 'Concluído', '30/11/2026 19:30', '30/11/2026 22:00', '', 'SALA 1', '10', '', '0', '0,00', '0', '0',
    '0', '0', '0', '', '', '16/09/2026 20:30',
];

describe('teste de ouro: CSV padrão de cursos', () => {
    it('19 colunas, na ordem e no formato de hoje', async () => {
        expect(COURSES_HEADER).toHaveLength(19);
        expect(HORTA_ROW).toHaveLength(19);
        expect(CURSO_B_ROW).toHaveLength(19);

        vi.mocked(repo.courses).mockResolvedValue([horta, cursoB] as never);
        const r = await useCase().execute('courses', { search: 'curso' });
        expect(r.error).toBeUndefined();
        expect(r.result!.csv).toBe(file(COURSES_HEADER, HORTA_ROW, CURSO_B_ROW));
        expect(r.result!.count).toBe(2);
        expect(r.result!.filename).toBe('cursos-2026-09-17.csv');
    });

    it('um curso pelo id: o nome dele no nome do arquivo', async () => {
        vi.mocked(repo.courses).mockResolvedValue([horta] as never);
        const r = await useCase().execute('courses', { ids: ['c1'] });
        expect(r.result!.csv).toBe(file(COURSES_HEADER, HORTA_ROW));
        expect(r.result!.filename).toBe('curso-horta-organica-2026-09-17.csv');
    });

    it('lista vazia: só o cabeçalho', async () => {
        vi.mocked(repo.courses).mockResolvedValue([] as never);
        const r = await useCase().execute('courses', { status: 'PRIVATE' });
        expect(r.result!.csv).toBe(file(COURSES_HEADER));
    });
});

// ── Mensagens de contato ─────────────────────────────────────────────────────

const MESSAGES_HEADER = ['Recebida em', 'Nome', 'E-mail', 'Telefone', 'Assunto', 'Mensagem', 'Lida'];

const mensagemJoao = {
    id: 'm1',
    name: 'JOÃO',
    email: 'joao@test.com',
    phone: '44999990000',
    subject: 'Dúvida; "curso"',
    message: 'linha 1\nlinha 2',
    read: true,
    createdAt: d('2026-09-17T02:59:00.000Z'),
};

/** Fórmula no nome e na mensagem; sem telefone nem assunto. */
const mensagemMaria = {
    id: 'm2',
    name: '@MARIA',
    email: 'maria@test.com',
    phone: null,
    subject: null,
    message: '+55 me liga',
    read: false,
    createdAt: d('2026-01-02T15:30:00.000Z'),
};

const JOAO_MESSAGE_ROW = ['16/09/2026 23:59', 'JOÃO', 'joao@test.com', '44999990000', 'Dúvida; ""curso""', 'linha 1\nlinha 2', 'Sim'];
const MARIA_MESSAGE_ROW = ['02/01/2026 12:30', `'@MARIA`, 'maria@test.com', '', '', `'+55 me liga`, 'Não'];

describe('teste de ouro: CSV padrão de mensagens de contato', () => {
    it('7 colunas, na ordem e no formato de hoje', async () => {
        vi.mocked(repo.contactMessages).mockResolvedValue([mensagemJoao, mensagemMaria] as never);
        const r = await useCase().execute('contact-messages', { search: 'test',
read: 'false' });
        expect(r.error).toBeUndefined();
        expect(r.result!.csv).toBe(file(MESSAGES_HEADER, JOAO_MESSAGE_ROW, MARIA_MESSAGE_ROW));
        expect(r.result!.count).toBe(2);
        expect(r.result!.filename).toBe('mensagens-2026-09-17.csv');
    });

    it('uma mensagem pelo id: o nome de quem mandou no nome do arquivo', async () => {
        vi.mocked(repo.contactMessages).mockResolvedValue([mensagemJoao] as never);
        const r = await useCase().execute('contact-messages', { ids: ['m1'] });
        expect(r.result!.csv).toBe(file(MESSAGES_HEADER, JOAO_MESSAGE_ROW));
        expect(r.result!.filename).toBe('mensagem-joao-2026-09-17.csv');
    });

    it('lista vazia: só o cabeçalho', async () => {
        vi.mocked(repo.contactMessages).mockResolvedValue([] as never);
        const r = await useCase().execute('contact-messages', {});
        expect(r.result!.csv).toBe(file(MESSAGES_HEADER));
    });
});
