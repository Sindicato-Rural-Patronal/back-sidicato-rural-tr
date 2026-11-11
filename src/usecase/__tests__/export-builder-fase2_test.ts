import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExportDataUseCase } from '../export-data.js';
import type { ExportRepository } from '../../ports/external/export-repository.js';
import { EXPORT_SOURCES } from '../export/catalog/index.js';
import { ADMIN_FREE_PERSON_FIELDS } from '../export/catalog/admins.js';
import { GetExportCatalogUseCase } from '../export/get-export-catalog.js';
import type { ExportActor } from '../export/engine.js';
import { ForbiddenError } from '../../errors/auth.js';

// Montador de relatórios, fase 2 (decisão 006): as fontes que saíram do
// caminho antigo. O padrão de cada uma é congelado pelo teste de ouro
// (`export-golden-fase2_test.ts`); aqui ficam o catálogo, os campos
// escolhidos, o PDF, os filtros em palavras e a auditoria.

const repo = {
    people: vi.fn(),
    companies: vi.fn(),
    properties: vi.fn(),
    admins: vi.fn(),
    courses: vi.fn(),
    registrations: vi.fn(),
    courseNames: vi.fn(),
    ruleName: vi.fn(),
    contactMessages: vi.fn(),
    unimed: vi.fn(),
    auditLogs: vi.fn(),
    roomBookings: vi.fn(),
    logExport: vi.fn(),
} as unknown as ExportRepository;

// 17/09/2026 10:00 em Brasília.
const now = () => new Date('2026-09-17T13:00:00.000Z');
const useCase = () => new ExportDataUseCase(repo, now);

const can = (...permissions: string[]): ExportActor => ({ has: p => permissions.includes(p) });

/** Tira o BOM e separa linhas/células (as células vêm sempre entre aspas). */
function parse(csv: string): string[][] {
    return csv
        .replace(/^﻿/, '')
        .trim()
        .split('\r\n')
        .map(line => line.slice(1, -1).split('";"'));
}

const keysOf = (dataset: keyof typeof EXPORT_SOURCES) => EXPORT_SOURCES[dataset].fields.map(f => f.key);
const groupsOf = (dataset: keyof typeof EXPORT_SOURCES) => [...new Set(EXPORT_SOURCES[dataset].fields.map(f => f.group))];

beforeEach(() => vi.clearAllMocks());

// ── Empresas ─────────────────────────────────────────────────────────────────

function company(overrides: Record<string, unknown> = {}) {
    return {
        id: 'c1',
        name: 'AGRO LTDA',
        tradeName: 'AGRO',
        cnpj: '11222333000181',
        stateRegistration: null,
        type: 'PRIVATE',
        email: 'agro@test.com',
        phone: '4436451234',
        phone2: null,
        phone3: null,
        website: null,
        notes: null,
        isPartner: true,
        partnerUrl: null,
        createdAt: new Date('2026-01-02T15:30:00.000Z'),
        updatedAt: new Date('2026-01-02T15:30:00.000Z'),
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
        members: [{ title: 'SOCIO',
userData: { name: 'JOÃO',
cpf: '12345678909' } }],
        properties: [],
        ...overrides,
    };
}

describe('empresas no montador', () => {
    it('catálogo: grupos, padrão de 30 colunas, modelos e nenhum campo com permissão a mais', () => {
        const source = EXPORT_SOURCES.companies;
        expect(source.padrao).toHaveLength(30);
        expect(groupsOf('companies')).toEqual(['Empresa', 'Contato', 'Sede', 'Vínculos', 'Parceria', 'Sistema', 'Relatório']);
        expect(keysOf('companies')).toEqual(expect.arrayContaining(['addressLine', 'ordinal', 'signature']));
        expect(source.padrao).not.toContain('addressLine');
        expect(source.fields.filter(f => f.permission)).toEqual([]);
        expect(source.modelos).toEqual([
            { id: 'razao-social-cnpj',
name: 'Razão social e CNPJ',
fields: ['name', 'cnpj'] },
            { id: 'contato',
name: 'Contato',
fields: ['name', 'tradeName', 'phone', 'phone2', 'phone3', 'email', 'addressCity'] },
        ]);
        // A empresa não é dado pessoal; o contato e as pessoas vinculadas são.
        const privacy = new Map(source.fields.map(f => [f.key, f.privacy]));
        for (const key of ['email', 'phone', 'phone2', 'phone3', 'members']) expect(privacy.get(key), key).toBe('pessoal');
        for (const key of ['name', 'cnpj', 'addressCity', 'properties']) expect(privacy.get(key), key).toBe('comum');

        const catalog = new GetExportCatalogUseCase().execute('companies', can('READ_USER')).catalog!;
        expect(catalog).toMatchObject({
            dataset: 'companies',
            title: 'Empresas',
            filterLabels: { search: 'Busca',
type: 'Tipo',
isPartner: 'Só parceiras' },
        });
    });

    it('campos escolhidos: CNPJ e telefone com máscara, sede numa linha', async () => {
        vi.mocked(repo.companies).mockResolvedValue([company()] as never);
        const r = await useCase().execute('companies', { fields: 'ordinal,name,cnpj,phone,addressLine' });
        expect(r.error).toBeUndefined();
        expect(parse(r.result!.csv)).toEqual([
            ['Nº de ordem', 'Razão social', 'CNPJ', 'Telefone', 'Sede numa linha'],
            ['1', 'AGRO LTDA', '11.222.333/0001-81', '(44) 3645-1234', 'RUA X, 10 - CENTRO - TERRA ROXA/PR - 85990-000'],
        ]);
        expect(repo.companies).toHaveBeenCalledWith(expect.objectContaining({ take: 20001 }));
    });

    it('PDF: filtros em palavras (tipo pelo rótulo, parceira) e o modelo pelo nome', async () => {
        vi.mocked(repo.companies).mockResolvedValue([company()] as never);
        const r = await useCase().execute('companies', {
            fields: ['name', 'cnpj'],
            format: 'pdf',
            modelo: 'razao-social-cnpj',
            search: 'agro',
            type: 'PRIVATE',
            isPartner: 'true',
        });
        expect(r.result!.pdf).toMatchObject({
            title: 'Empresas',
            filename: 'empresas-2026-09-17.pdf',
            filters: 'Busca: agro · Tipo: Privada · Só parceiras',
            modelo: 'Razão social e CNPJ',
            rows: [['AGRO LTDA', '11.222.333/0001-81']],
        });
        const naoParceiras = await useCase().execute('companies', { fields: ['name'],
format: 'pdf',
isPartner: false });
        expect(naoParceiras.result!.pdf!.filters).toBe('Só não parceiras');
    });

    it('auditoria: o alvo cita o contato; a empresa sozinha não cita nada', async () => {
        vi.mocked(repo.companies).mockResolvedValue([company()] as never);
        const contato = await useCase().execute('companies', { ids: ['c1'],
fields: ['name', 'email', 'phone'],
modelo: 'contato' });
        expect(contato.result!.auditLabel).toBe('Empresas: AGRO · CSV · com E-mail, Telefone');
        expect(contato.result!.auditDetails).toEqual({
            formato: 'csv',
            modelo: 'Contato',
            campos: ['Razão social', 'E-mail', 'Telefone'],
            escopo: 'seleção',
            filtros: [{ nome: 'Seleção',
valor: '1 registro' }],
            linhas: 1,
        });
        const cnpj = await useCase().execute('companies', { fields: ['name', 'cnpj'] });
        expect(cnpj.result!.auditLabel).toBe('Empresas: 1 registro (todos) · CSV');
    });
});

// ── Propriedades ─────────────────────────────────────────────────────────────

function property(overrides: Record<string, unknown> = {}) {
    return {
        id: 'pr1',
        name: 'SITIO',
        registration: '99',
        createdAt: new Date('2026-01-02T15:30:00.000Z'),
        address: {
            type: 'RURAL',
street: null,
number: null,
complement: null,
neighborhood: null,
localityName: 'AGUA DO SOL',
            road: 'ESTRADA BOIADEIRA',
km: '12',
lot: null,
section: null,
city: 'TERRA ROXA',
state: 'PR',
zipCode: '85990000',
            notes: null,
        },
        userDataId: 'u1',
        companyId: null,
        userData: { name: 'JOÃO',
cpf: '12345678909',
primaryPropertyId: 'pr1' },
        company: null,
        ...overrides,
    };
}

const agroProperty = property({
    id: 'pr2',
    name: 'SEDE',
    userDataId: null,
    companyId: 'c1',
    userData: null,
    company: { name: 'AGRO LTDA',
tradeName: 'AGRO',
cnpj: '11222333000181',
primaryPropertyId: null },
});

describe('propriedades no montador', () => {
    it('catálogo: padrão de 21 colunas, só o modelo Padrão, CPF/CNPJ e endereço pessoais', () => {
        const source = EXPORT_SOURCES.properties;
        expect(source.padrao).toHaveLength(21);
        expect(source.modelos).toEqual([]);
        expect(groupsOf('properties')).toEqual(['Propriedade', 'Dono', 'Endereço', 'Sistema', 'Relatório']);
        expect(source.fields.filter(f => f.permission)).toEqual([]);
        const privacy = new Map(source.fields.map(f => [f.key, f.privacy]));
        for (const key of ['ownerDocument', 'addressStreet', 'addressCity', 'addressLine', 'addressNotes']) {
            expect(privacy.get(key), key).toBe('pessoal');
        }
        expect(privacy.get('ownerName')).toBe('comum');
    });

    it('campos escolhidos: o documento de cada dono com a máscara dele e o endereço numa linha', async () => {
        vi.mocked(repo.properties).mockResolvedValue([property(), agroProperty] as never);
        const r = await useCase().execute('properties', { ownerIds: 'u1,c1',
fields: 'name,ownerName,ownerDocument,addressLine' });
        expect(parse(r.result!.csv)).toEqual([
            ['Propriedade', 'Nome do dono', 'CPF/CNPJ', 'Endereço numa linha'],
            ['SITIO', 'JOÃO', '123.456.789-09', 'ESTRADA BOIADEIRA - AGUA DO SOL, km 12 - TERRA ROXA/PR - 85990-000'],
            ['SEDE', 'AGRO', '11.222.333/0001-81', 'ESTRADA BOIADEIRA - AGUA DO SOL, km 12 - TERRA ROXA/PR - 85990-000'],
        ]);
        expect(repo.properties).toHaveBeenCalledWith({ ids: undefined,
ownerIds: ['u1', 'c1'],
take: 20001 });
        expect(r.result!.auditLabel).toBe('Propriedades: 2 registros (com filtros) · CSV · com CPF/CNPJ, Endereço numa linha');
    });

    it('filtro em palavras: os donos pelo nome; dono sem linha ou mais de 3 → a quantidade', async () => {
        vi.mocked(repo.properties).mockResolvedValue([property(), agroProperty] as never);
        const two = await useCase().execute('properties', { ownerIds: ['u1', 'c1'],
fields: ['name'],
format: 'pdf' });
        expect(two.result!.pdf).toMatchObject({ title: 'Propriedades',
filters: 'Donos: JOÃO, AGRO',
modelo: null });
        const one = await useCase().execute('properties', { ownerIds: ['u1'],
fields: ['name'],
format: 'pdf' });
        expect(one.result!.pdf!.filters).toBe('Dono: JOÃO');
        const missing = await useCase().execute('properties', { ownerIds: ['u1', 'sem-propriedade'],
fields: ['name'],
format: 'pdf' });
        expect(missing.result!.pdf!.filters).toBe('Donos: 2');
        const many = await useCase().execute('properties', { ownerIds: 'a,b,c,d',
fields: ['name'],
format: 'pdf' });
        expect(many.result!.pdf!.filters).toBe('Donos: 4');
        expect(many.result!.auditDetails!.filtros).toEqual([{ nome: 'Donos',
valor: '4' }]);
    });
});

// ── Administradores ──────────────────────────────────────────────────────────

function admin(overrides: Record<string, unknown> = {}) {
    return {
        id: 'a1',
        username: 'joao',
        createdAt: new Date('2026-02-01T10:00:00.000Z'),
        userData: {
            name: 'JOÃO',
email: 'joao@test.com',
cpf: '12345678909',
phone: '44999990000',
phone2: null,
phone3: null,
            rg: '1234567',
primaryPropertyId: null,
properties: [],
createdAt: new Date('2025-01-01T12:00:00.000Z'),
        },
        rules: { name: 'SECRETARIA' },
        ...overrides,
    };
}

describe('administradores no montador', () => {
    it('catálogo: os 4 campos de pessoa de sempre só com READ_USER_ADMIN; o resto da pessoa pede READ_USER', () => {
        const source = EXPORT_SOURCES.admins;
        expect(source.padrao).toEqual(['username', 'name', 'email', 'cpf', 'phone', 'rule', 'adminCreatedAt']);
        expect(groupsOf('admins')[0]).toBe('Acesso');
        // "Usuário do painel" repete o "Usuário".
        expect(keysOf('admins')).not.toContain('adminUsername');
        const personKeys = EXPORT_SOURCES.people.fields.filter(f => f.group !== 'Relatório' && f.key !== 'adminUsername').map(f => f.key);
        for (const key of personKeys) {
            const field = source.fields.find(f => f.key === key)!;
            const free = (ADMIN_FREE_PERSON_FIELDS as readonly string[]).includes(key);
            expect(field.permission, key).toBe(free ? undefined : 'READ_USER');
        }
        expect(source.modelos).toEqual([{ id: 'contato',
name: 'Contato',
fields: ['name', 'phone', 'email'] }]);

        const only = new GetExportCatalogUseCase().execute('admins', can('READ_USER_ADMIN')).catalog!;
        const fields = only.groups.flatMap(g => g.fields);
        expect(fields.find(f => f.key === 'cpf')).toMatchObject({ allowed: true,
reason: null });
        expect(fields.find(f => f.key === 'rg')).toMatchObject({ allowed: false,
reason: 'Pede a permissão Visualizar usuários' });
        expect(only.filterLabels).toEqual({ search: 'Busca',
rulesId: 'Regra de acesso' });
    });

    it('campo da pessoa além dos de sempre sem READ_USER → 403 com os rótulos; com READ_USER, sai', async () => {
        vi.mocked(repo.admins).mockResolvedValue([admin()] as never);
        const denied = await useCase().execute('admins', { fields: ['username', 'rg', 'createdAt'] }, can('READ_USER_ADMIN'));
        expect(denied.error).toBeInstanceOf(ForbiddenError);
        expect(denied.error!.message).toBe('Sem permissão para exportar: RG, Cadastrado em.');
        expect(repo.admins).not.toHaveBeenCalled();

        const ok = await useCase().execute(
            'admins',
            { fields: ['username', 'name', 'phone', 'rg', 'adminCreatedAt', 'createdAt'] },
            can('READ_USER_ADMIN', 'READ_USER'),
        );
        expect(parse(ok.result!.csv)).toEqual([
            ['Usuário', 'Nome', 'Telefone', 'RG', 'Criado em', 'Cadastrado em'],
            ['joao', 'JOÃO', '(44) 99999-0000', '1234567', '01/02/2026 07:00', '01/01/2025 09:00'],
        ]);
    });

    it('filtro de regra em palavras: o nome das linhas ou, sem linha, pelo id', async () => {
        vi.mocked(repo.admins).mockResolvedValue([admin()] as never);
        const r = await useCase().execute('admins', { rulesId: 'r1',
fields: ['name'],
format: 'pdf',
modelo: 'contato' });
        expect(r.result!.pdf).toMatchObject({ title: 'Administradores',
filters: 'Regra de acesso: SECRETARIA',
modelo: 'Contato' });
        expect(repo.ruleName).not.toHaveBeenCalled();

        vi.mocked(repo.admins).mockResolvedValue([] as never);
        vi.mocked(repo.ruleName).mockResolvedValue('FINANCEIRO');
        const empty = await useCase().execute('admins', { rulesId: 'r2',
search: 'ana',
fields: ['name'],
format: 'pdf' });
        expect(repo.ruleName).toHaveBeenCalledWith('r2');
        expect(empty.result!.pdf!.filters).toBe('Busca: ana · Regra de acesso: FINANCEIRO');
        expect(empty.result!.auditLabel).toBe('Administradores: 0 registros (com filtros) · PDF');
    });
});

// ── Cursos ───────────────────────────────────────────────────────────────────

function course(overrides: Record<string, unknown> = {}) {
    return {
        id: 'c1',
        name: 'HORTA',
        description: 'x',
        eventNumber: '2026/15',
        status: 'COMPLETED',
        startTime: new Date('2026-09-10T08:00:00.000Z'),
        endTime: new Date('2026-09-10T12:00:00.000Z'),
        registrationDeadline: null,
        workloadHours: 4,
        price: 0,
        minStudents: 0,
        preEnrolled: 0,
        waitlist: 0,
        observations: null,
        createdAt: new Date('2026-09-01T12:00:00.000Z'),
        room: { name: 'AUDITORIO',
maxCapacity: 50 },
        instructors: [{ title: null,
instructor: { userData: { name: 'PEDRO' } } }],
        courseUserRegistration: [],
        ...overrides,
    };
}

describe('cursos no montador', () => {
    it('catálogo: padrão de 19 colunas, modelo Calendário, filtros de aba e ano, nada pessoal', () => {
        const source = EXPORT_SOURCES.courses;
        expect(source.padrao).toHaveLength(19);
        expect(groupsOf('courses')).toEqual(['Curso', 'Datas', 'Sala', 'Vagas e inscrições', 'Sistema', 'Relatório']);
        expect(source.modelos).toEqual([
            { id: 'calendario',
name: 'Calendário',
fields: ['name', 'startTime', 'endTime', 'room', 'instructors'] },
        ]);
        expect(source.fields.filter(f => f.privacy !== 'comum')).toEqual([]);
        expect(source.filterLabels).toEqual({ view: 'Aba',
search: 'Busca',
year: 'Ano',
status: 'Status' });
    });

    it('aba e ano chegam ao repositório como na lista: Armazenados corta no dia de hoje e vem do mais recente', async () => {
        vi.mocked(repo.courses).mockResolvedValue([] as never);
        // Hoje é 17/09/2026 em Brasília: o corte é amanhã, 00:00 (horário de parede).
        const tomorrow = new Date('2026-09-18T00:00:00.000Z');

        await useCase().execute('courses', { view: 'stored',
year: '2026',
search: 'horta' });
        expect(repo.courses).toHaveBeenLastCalledWith({
            ids: undefined,
search: 'horta',
status: undefined,
year: 2026,
startsBefore: tomorrow,
order: 'desc',
take: 20001,
        });

        await useCase().execute('courses', { view: 'upcoming',
year: 2027 });
        expect(repo.courses).toHaveBeenLastCalledWith(expect.objectContaining({ startsFrom: tomorrow,
year: 2027,
order: 'asc' }));

        // Sem aba, como sempre: sem corte de data e do início mais cedo.
        await useCase().execute('courses', {});
        const last = vi.mocked(repo.courses).mock.calls.at(-1)![0];
        expect(last).toMatchObject({ order: 'asc' });
        expect(last).not.toHaveProperty('startsFrom');
        expect(last).not.toHaveProperty('startsBefore');
    });

    it('aba ou ano inválidos → 400, sem consultar', async () => {
        for (const [input, message] of [
            [{ view: 'todos' }, 'Filtro inválido'],
            [{ year: '20x6' }, 'Ano inválido: use de 1990 a 2100'],
            [{ year: '1500' }, 'Ano inválido: use de 1990 a 2100'],
            [{ year: 2026.5 }, 'Ano inválido: use de 1990 a 2100'],
        ] as const) {
            const r = await useCase().execute('courses', input);
            expect(r.error!.message, JSON.stringify(input)).toBe(message);
        }
        expect(repo.courses).not.toHaveBeenCalled();
    });

    it('PDF: aba, busca, ano e status em palavras; o modelo Calendário', async () => {
        vi.mocked(repo.courses).mockResolvedValue([course()] as never);
        const r = await useCase().execute('courses', {
            view: 'stored',
search: 'horta',
year: '2026',
status: 'COMPLETED',
            fields: ['name', 'startTime', 'endTime', 'room', 'instructors'],
modelo: 'calendario',
format: 'pdf',
        });
        expect(r.result!.pdf).toMatchObject({
            title: 'Cursos',
            filters: 'Aba: Armazenados · Busca: horta · Ano: 2026 · Status: Concluído',
            modelo: 'Calendário',
            rows: [['HORTA', '10/09/2026 08:00', '10/09/2026 12:00', 'AUDITORIO', 'PEDRO']],
        });
        expect(r.result!.auditLabel).toBe('Cursos: 1 registro (com filtros) · PDF');
        const proximos = await useCase().execute('courses', { view: 'upcoming',
fields: ['name'],
format: 'pdf' });
        expect(proximos.result!.pdf!.filters).toBe('Aba: Próximos');
    });
});

// ── Mensagens de contato ─────────────────────────────────────────────────────

const message = {
    id: 'm1',
    name: 'JOÃO',
    email: 'joao@test.com',
    phone: '44999990000',
    subject: 'Curso',
    message: '=HYPERLINK("x")',
    read: false,
    createdAt: new Date('2026-09-17T02:59:00.000Z'),
};

describe('mensagens de contato no montador', () => {
    it('catálogo: padrão de 7 colunas, modelo Contato, a mensagem e o contato pessoais', () => {
        const source = EXPORT_SOURCES['contact-messages'];
        expect(source.padrao).toEqual(['receivedAt', 'name', 'email', 'phone', 'subject', 'message', 'read']);
        expect(groupsOf('contact-messages')).toEqual(['Mensagem', 'Quem mandou', 'Relatório']);
        expect(source.modelos).toEqual([{ id: 'contato',
name: 'Contato',
fields: ['name', 'email', 'phone'] }]);
        const pessoais = source.fields.filter(f => f.privacy !== 'comum').map(f => f.key);
        expect(pessoais).toEqual(['message', 'email', 'phone']);
        expect(new GetExportCatalogUseCase().execute('contact-messages').catalog!.title).toBe('Mensagens de contato');
    });

    it('campos escolhidos: telefone com máscara; fórmula neutralizada no CSV e crua no PDF; lidas em palavras', async () => {
        vi.mocked(repo.contactMessages).mockResolvedValue([message] as never);
        const csv = await useCase().execute('contact-messages', { fields: 'name,phone,message',
read: 'false',
search: 'joão' });
        expect(parse(csv.result!.csv)).toEqual([['Nome', 'Telefone', 'Mensagem'], ['JOÃO', '(44) 99999-0000', `'=HYPERLINK(""x"")`]]);
        expect(repo.contactMessages).toHaveBeenCalledWith({ ids: undefined,
search: 'joão',
read: false,
take: 20001 });
        expect(csv.result!.auditLabel).toBe('Mensagens de contato: 1 registro (com filtros) · CSV · com Telefone, Mensagem');

        const pdf = await useCase().execute('contact-messages', { fields: ['name', 'message'],
format: 'pdf',
read: 'true',
modelo: 'contato' });
        expect(pdf.result!.pdf).toMatchObject({
            title: 'Mensagens de contato',
            filename: 'mensagens-2026-09-17.pdf',
            filters: 'Só lidas',
            modelo: 'Contato',
            rows: [['JOÃO', '=HYPERLINK("x")']],
        });
        const naoLidas = await useCase().execute('contact-messages', { fields: ['name'],
format: 'pdf',
read: false });
        expect(naoLidas.result!.pdf!.filters).toBe('Só não lidas');
    });
});
