import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExportDataUseCase } from '../export-data.js';
import type { ExportRepository } from '../../ports/external/export-repository.js';
import { ValidationError } from '../../errors/validation.js';
import { ForbiddenError } from '../../errors/auth.js';
import { NotFoundError } from '../../errors/not-found.js';
import { EXPORT_SOURCES, NO_BUILDER_MESSAGE } from '../export/catalog/index.js';
import { REGISTRATION_FREE_PERSON_FIELDS } from '../export/catalog/registrations.js';
import { GetExportCatalogUseCase } from '../export/get-export-catalog.js';
import { citedPersonalFields, type ExportActor } from '../export/engine.js';
import { formatCns, formatPhone } from '../export/format.js';
import { MEMBER_TYPE_LABEL } from '../../lib/export-labels.js';
import { MEMBER_TYPES } from '../../lib/member-types.js';

// Montador de relatórios (decisão 006): catálogo, campos escolhidos, formatos,
// permissão por campo, limites e o texto da auditoria.

const repo = {
    people: vi.fn(),
    companies: vi.fn(),
    registrations: vi.fn(),
    courseNames: vi.fn(),
    courses: vi.fn(),
    logExport: vi.fn(),
} as unknown as ExportRepository;

// 17/09/2026 10:00 em Brasília.
const now = () => new Date('2026-09-17T13:00:00.000Z');
const useCase = () => new ExportDataUseCase(repo, now);

const can = (...permissions: string[]): ExportActor => ({ has: p => permissions.includes(p) });

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
        phone2: '4436451234',
        phone3: '+55 44 99999-1111',
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
        properties: [
            {
                id: 'prop1',
                name: 'SEDE',
                registration: null,
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

function registration(id: string, userData: Record<string, unknown>, confirmed = true) {
    return {
        id,
        confirmed,
        attended: null,
        createdAt: new Date('2026-09-01T12:00:00.000Z'),
        ficha: null,
        course: { name: 'HORTA',
eventNumber: null,
startTime: new Date('2026-10-05T08:00:00.000Z') },
        userData: person(userData),
    };
}

/** Tira o BOM e separa linhas/células (as células vêm sempre entre aspas). */
function parse(csv: string): string[][] {
    return csv
        .replace(/^﻿/, '')
        .trim()
        .split('\r\n')
        .map(line => line.slice(1, -1).split('";"'));
}

beforeEach(() => vi.clearAllMocks());

describe('catálogo: as regras da decisão', () => {
    for (const [dataset, source] of Object.entries(EXPORT_SOURCES)) {
        it(`${dataset}: chaves e rótulos únicos; padrão e modelos só com chaves do catálogo e sem permissão a mais`, () => {
            const keys = source.fields.map(f => f.key);
            const labels = source.fields.map(f => f.label);
            expect(new Set(keys).size).toBe(keys.length);
            expect(new Set(labels).size).toBe(labels.length);
            const byKey = new Map(source.fields.map(f => [f.key, f]));
            for (const modelo of [{ id: 'padrao',
fields: source.padrao }, ...source.modelos]) {
                for (const key of modelo.fields) {
                    expect(byKey.has(key), `${modelo.id}: ${key}`).toBe(true);
                    // Todo modelo de fábrica cabe na permissão da própria fonte.
                    expect(byKey.get(key)!.permission, `${modelo.id}: ${key}`).toBeUndefined();
                }
                expect(new Set(modelo.fields).size).toBe(modelo.fields.length);
            }
            expect(source.fields.length).toBeLessThanOrEqual(80);
        });
    }

    it('pessoas: o padrão são as 57 colunas de hoje; Idade, Endereço numa linha, Nº de ordem e Assinatura existem fora dele', () => {
        const people = EXPORT_SOURCES.people;
        expect(people.padrao).toHaveLength(57);
        for (const key of ['age', 'addressLine', 'ordinal', 'signature']) {
            expect(people.fields.some(f => f.key === key)).toBe(true);
            expect(people.padrao).not.toContain(key);
        }
        // Em Pessoas nenhum campo pede permissão além de READ_USER (a da fonte).
        expect(people.fields.filter(f => f.permission)).toEqual([]);
        expect(people.modelos.map(m => m.id)).toEqual([
            'nome-cpf', 'nome-email', 'contato', 'lista-presenca', 'endereco-correspondencia', 'associados',
        ]);
    });

    it('inscrições: os 10 campos de pessoa de sempre ficam só com READ_COURSE; o resto da pessoa pede READ_USER', () => {
        const regs = EXPORT_SOURCES.registrations;
        expect(regs.padrao).toHaveLength(17);
        const personKeys = EXPORT_SOURCES.people.fields.filter(f => f.group !== 'Relatório').map(f => f.key);
        for (const key of personKeys) {
            const field = regs.fields.find(f => f.key === key)!;
            const free = (REGISTRATION_FREE_PERSON_FIELDS as readonly string[]).includes(key);
            expect(field.permission, key).toBe(free ? undefined : 'READ_USER');
        }
        expect(regs.modelos.find(m => m.id === 'lista-presenca')).toMatchObject({
            fields: ['ordinal', 'name', 'cpf', 'signature'],
            confirmed: true,
        });
    });

    it('a privacidade: documentos e contato pessoais; etnia, necessidades especiais, Unimed e associado sensíveis', () => {
        const privacy = new Map(EXPORT_SOURCES.people.fields.map(f => [f.key, f.privacy]));
        for (const key of ['cpf', 'rg', 'birthDate', 'email', 'phone', 'addressStreet', 'familyIncome']) {
            expect(privacy.get(key), key).toBe('pessoal');
        }
        for (const key of ['ethnicity', 'specialNeeds', 'unimedPlan', 'memberStatus', 'activeMember']) {
            expect(privacy.get(key), key).toBe('sensivel');
        }
        expect(privacy.get('name')).toBe('comum');
    });

    it('largura no PDF: Nº de ordem cabe o rótulo; UF, número e Confirmada sem a largura de texto (SR-093)', async () => {
        vi.mocked(repo.registrations).mockResolvedValue([] as never);
        const r = await useCase().execute(
            'registrations',
            { fields: 'ordinal,name,age,confirmed,addressNumber,addressKm,addressLot,addressSection,addressState',
format: 'pdf' },
            can('READ_COURSE', 'READ_USER'),
        );
        const weight = Object.fromEntries(r.result!.pdf!.columns.map(c => [c.key, c.weight]));
        expect(weight).toEqual({
            ordinal: 1.5,
            name: 3,
            age: 1,
            confirmed: 1.25,
            addressNumber: 1.25,
            addressKm: 1.25,
            addressLot: 1.25,
            addressSection: 1.25,
            addressState: 1,
        });
    });
});

describe('GetExportCatalogUseCase', () => {
    it('agrupa os campos e mostra o que a pessoa não pode exportar, com o motivo', () => {
        const r = new GetExportCatalogUseCase().execute('registrations', can('READ_COURSE'));
        const catalog = r.catalog!;
        expect(catalog).toMatchObject({
            dataset: 'registrations',
            title: 'Inscrições',
            limits: { rows: 20000,
pdfRows: 2000,
fields: 80 },
            filterLabels: { courseIds: 'Cursos',
confirmed: 'Só confirmadas' },
        });
        expect(catalog.groups[0].name).toBe('Inscrição');
        const all = catalog.groups.flatMap(g => g.fields);
        expect(all.find(f => f.key === 'cpf')).toEqual({
            key: 'cpf',
label: 'CPF',
type: 'cpf',
privacy: 'pessoal',
allowed: true,
reason: null,
        });
        expect(all.find(f => f.key === 'rg')).toMatchObject({
            allowed: false,
            reason: 'Pede a permissão Visualizar usuários',
        });

        const withUser = new GetExportCatalogUseCase().execute('registrations', can('READ_COURSE', 'READ_USER'));
        expect(withUser.catalog!.groups.flatMap(g => g.fields).every(f => f.allowed)).toBe(true);
    });

    it('conjunto sem montador → 404 com a mensagem combinada', () => {
        const r = new GetExportCatalogUseCase().execute('courses', can('READ_COURSE'));
        expect(r.error).toBeInstanceOf(NotFoundError);
        expect(r.error!.message).toBe('Este conjunto ainda não tem o montador.');
    });
});

describe('montador: campos escolhidos', () => {
    it('as colunas saem na ordem pedida, com telefone mascarado, Nº de ordem, idade e assinatura', async () => {
        vi.mocked(repo.people).mockResolvedValue([person(), person({ id: 'p2',
name: 'MARIA',
phone: '4433334444' })] as never);
        const r = await useCase().execute('people', {
            fields: 'ordinal,name,phone,phone2,phone3,age,addressLine,signature',
        });
        expect(r.error).toBeUndefined();
        expect(parse(r.result!.csv)).toEqual([
            ['Nº de ordem', 'Nome', 'Telefone', 'Telefone 2', 'Telefone 3', 'Idade', 'Endereço numa linha', 'Assinatura'],
            [
                '1', 'JOÃO DA SILVA', '(44) 99999-0000', '(44) 3645-1234', `'+55 44 99999-1111`, '45',
                'RUA X, 10 - CENTRO - TERRA ROXA/PR - 85990-000', '',
            ],
            [
                '2', 'MARIA', '(44) 3333-4444', '(44) 3645-1234', `'+55 44 99999-1111`, '45',
                'RUA X, 10 - CENTRO - TERRA ROXA/PR - 85990-000', '',
            ],
        ]);
        expect(r.result!.filename).toBe('pessoas-2026-09-17.csv');
        // O repositório recebe o limite + 1, para saber se passou.
        expect(repo.people).toHaveBeenCalledWith(expect.objectContaining({ take: 20001 }));
    });

    it('POST com lista e GET com "a,b,c" dão o mesmo resultado; o padrão vale sem fields', async () => {
        vi.mocked(repo.people).mockResolvedValue([person()] as never);
        const list = await useCase().execute('people', { fields: ['name', 'cpf'] });
        const text = await useCase().execute('people', { fields: 'name, cpf' });
        expect(list.result!.csv).toBe(text.result!.csv);
        expect(parse(list.result!.csv)).toEqual([['Nome', 'CPF'], ['JOÃO DA SILVA', '123.456.789-09']]);

        const padrao = await useCase().execute('people', {});
        expect(parse(padrao.result!.csv)[0]).toHaveLength(57);
    });

    it('fórmula continua neutralizada no CSV e sai sem o apóstrofo no PDF', async () => {
        vi.mocked(repo.people).mockResolvedValue([person()] as never);
        const csv = await useCase().execute('people', { fields: ['name', 'memberNotes'] });
        expect(parse(csv.result!.csv)[1]).toEqual(['JOÃO DA SILVA', `'=HYPERLINK(""x"")`]);
        const pdf = await useCase().execute('people', { fields: ['name', 'memberNotes'],
format: 'pdf' });
        expect(pdf.result!.pdf!.rows).toEqual([['JOÃO DA SILVA', '=HYPERLINK("x")']]);
    });
});

describe('montador: PDF', () => {
    it('devolve o JSON com título, filtros em palavras, modelo, colunas e linhas formatadas', async () => {
        vi.mocked(repo.people).mockResolvedValue([person()] as never);
        const r = await useCase().execute('people', {
            fields: ['name', 'cpf', 'specialNeeds', 'birthDate'],
            format: 'pdf',
            modelo: 'nome-cpf',
            search: 'silva',
            activeMember: 'true',
            gender: 'MALE',
        });
        expect(r.error).toBeUndefined();
        expect(r.result!.csv).toBe('');
        expect(r.result!.pdf).toEqual({
            title: 'Pessoas',
            filename: 'pessoas-2026-09-17.pdf',
            count: 1,
            filters: 'Busca: silva · Sexo: Masculino · Só associados em dia',
            modelo: 'Nome e CPF',
            columns: [
                { key: 'name',
label: 'Nome',
type: 'text',
weight: 3 },
                { key: 'cpf',
label: 'CPF',
type: 'cpf',
weight: 2 },
                { key: 'specialNeeds',
label: 'Necessidades especiais',
type: 'boolean',
weight: 1 },
                { key: 'birthDate',
label: 'Nascimento',
type: 'date',
weight: 1.5 },
            ],
            rows: [['JOÃO DA SILVA', '123.456.789-09', 'Não', '18/09/1980']],
        });
    });

    it('modelo que não é de fábrica vai como veio; sem fields o modelo é o Padrão', async () => {
        vi.mocked(repo.people).mockResolvedValue([] as never);
        const custom = await useCase().execute('people', { fields: ['name'],
format: 'pdf',
modelo: ' Meu modelo ' });
        expect(custom.result!.pdf!.modelo).toBe('Meu modelo');
        const padrao = await useCase().execute('people', { format: 'pdf' });
        expect(padrao.result!.pdf!.modelo).toBe('Padrão (como hoje)');
        expect(padrao.result!.pdf!.columns).toHaveLength(57);
    });

    it('tipo de membro sai pelo rótulo das telas (PDF e auditoria); a coluna sai como gravada', async () => {
        vi.mocked(repo.people).mockResolvedValue([person({ memberType: 'PRODUTOR RURAL' })] as never);
        const r = await useCase().execute('people', {
            fields: ['name', 'memberType'],
            format: 'pdf',
            memberType: 'PRODUTOR RURAL',
            memberClassification: 'PEQUENO',
            educationLevel: 'INCOMPLETE_PRIMARY',
        });
        expect(r.result!.pdf!.filters).toBe(
            'Tipo de membro: Produtor rural · Classificação: PEQUENO · Escolaridade: Fundamental incompleto',
        );
        expect(r.result!.auditDetails!.filtros).toEqual([
            { nome: 'Tipo de membro',
valor: 'Produtor rural' },
            { nome: 'Classificação',
valor: 'PEQUENO' },
            { nome: 'Escolaridade',
valor: 'Fundamental incompleto' },
        ]);
        expect(r.result!.pdf!.rows).toEqual([['JOÃO DA SILVA', 'PRODUTOR RURAL']]);
    });

    it('cada tipo de membro da lista fixa tem rótulo; valor fora da lista sai como veio', async () => {
        vi.mocked(repo.people).mockResolvedValue([] as never);
        const filtros = async (memberType: string) =>
            (await useCase().execute('people', { fields: ['name'],
format: 'pdf',
memberType })).result!.pdf!.filters;
        expect(await filtros('ALUNO')).toBe('Tipo de membro: Aluno');
        expect(await filtros('TRABALHADOR RURAL ASSALARIADO')).toBe('Tipo de membro: Trabalhador rural assalariado');
        expect(await filtros('TRABALHADOR RURAL AUTONOMO')).toBe('Tipo de membro: Trabalhador rural autônomo');
        expect(await filtros('SOCIO')).toBe('Tipo de membro: SOCIO');
        expect(Object.keys(MEMBER_TYPE_LABEL).sort()).toEqual([...MEMBER_TYPES].sort());
    });
});

describe('montador: erros e limites', () => {
    const cases: [string, Record<string, unknown>, string][] = [
        ['fields vazio', { fields: '' }, 'Escolha pelo menos um campo.'],
        ['lista vazia', { fields: [] }, 'Escolha pelo menos um campo.'],
        ['chave desconhecida', { fields: ['name', 'senha'] }, 'Campo desconhecido: senha.'],
        ['chave repetida', { fields: 'name,cpf,name' }, 'Campo repetido: Nome.'],
        ['81 campos', { fields: Array.from({ length: 81 }, () => 'name') }, 'No máximo 80 campos por relatório.'],
        ['formato', { format: 'xlsx' }, 'Formato inválido: use csv ou pdf.'],
        ['modelo longo', { modelo: 'x'.repeat(65) }, 'Parâmetro inválido: modelo'],
    ];
    for (const [name, input, message] of cases) {
        it(`${name} → 400 "${message}"`, async () => {
            const r = await useCase().execute('people', input);
            expect(r.error).toBeInstanceOf(ValidationError);
            expect(r.error!.message).toBe(message);
            expect(repo.people).not.toHaveBeenCalled();
        });
    }

    it('campo que pede permissão a mais → 403 com os rótulos; com a permissão, sai', async () => {
        vi.mocked(repo.registrations).mockResolvedValue([registration('r1', {})] as never);
        const denied = await useCase().execute(
            'registrations',
            { fields: ['name', 'cpf', 'rg', 'addressStreet'] },
            can('READ_COURSE'),
        );
        expect(denied.error).toBeInstanceOf(ForbiddenError);
        expect(denied.error!.message).toBe('Sem permissão para exportar: RG, Endereço: Rua.');
        expect(repo.registrations).not.toHaveBeenCalled();

        const ok = await useCase().execute(
            'registrations',
            { fields: ['name', 'cpf', 'rg', 'addressStreet'] },
            can('READ_COURSE', 'READ_USER'),
        );
        expect(parse(ok.result!.csv)).toEqual([['Nome', 'CPF', 'RG', 'Endereço: Rua'], ['JOÃO DA SILVA', '123.456.789-09', '1234567', 'RUA X']]);
    });

    it('mais de 20.000 linhas → 400; mais de 2.000 no PDF → 400 (o CSV com as mesmas linhas sai)', async () => {
        vi.mocked(repo.people).mockResolvedValue(Array.from({ length: 20001 }, () => person()) as never);
        const tooMany = await useCase().execute('people', { fields: ['name'] });
        expect(tooMany.error!.message).toBe('O relatório passa de 20.000 linhas. Use um filtro para diminuir.');

        vi.mocked(repo.people).mockResolvedValue(Array.from({ length: 2001 }, () => person()) as never);
        const pdf = await useCase().execute('people', { fields: ['name'],
format: 'pdf' });
        expect(pdf.error).toBeInstanceOf(ValidationError);
        expect(pdf.error!.message).toBe('O PDF aceita até 2.000 linhas. Baixe a planilha ou use um filtro.');
        const csv = await useCase().execute('people', { fields: ['name'] });
        expect(csv.result!.count).toBe(2001);
    });

    it('conjunto sem montador: fields ou PDF → 400; CSV sem fields continua igual', async () => {
        vi.mocked(repo.courses).mockResolvedValue([] as never);
        for (const input of [{ fields: 'name' }, { format: 'pdf' }]) {
            const r = await useCase().execute('courses', input);
            expect(r.error!.message).toBe(NO_BUILDER_MESSAGE);
        }
        expect((await useCase().execute('courses', { format: 'xlsx' })).error!.message).toBe('Formato inválido: use csv ou pdf.');
        const ok = await useCase().execute('courses', { format: 'csv' });
        expect(ok.result).toMatchObject({ format: 'csv',
auditDetails: null,
auditLabel: 'Cursos: 0 registros (todos)' });
    });
});

describe('montador: inscrições', () => {
    it('confirmed=true chega ao repositório e aparece nos filtros', async () => {
        vi.mocked(repo.registrations).mockResolvedValue([registration('r1', {})] as never);
        const r = await useCase().execute('registrations', {
            courseIds: 'c1',
            confirmed: 'true',
            fields: 'ordinal,name,cpf,signature',
            modelo: 'lista-presenca',
            format: 'pdf',
        });
        expect(repo.registrations).toHaveBeenCalledWith({ ids: undefined,
courseIds: ['c1'],
confirmed: true,
take: 20001 });
        expect(r.result!.pdf).toMatchObject({
            title: 'Inscrições',
            filename: 'inscricoes-2026-09-17.pdf',
            filters: 'Curso: HORTA · Só confirmadas',
            modelo: 'Lista de presença',
            rows: [['1', 'JOÃO DA SILVA', '123.456.789-09', '']],
        });
        // O nome veio das linhas: nada de consulta a mais.
        expect(repo.courseNames).not.toHaveBeenCalled();
    });

    it('curso sem nenhuma linha: o nome do filtro vem pelo id (PDF e auditoria)', async () => {
        vi.mocked(repo.registrations).mockResolvedValue([] as never);
        vi.mocked(repo.courseNames).mockResolvedValue([{ id: 'c1',
name: 'GESTÃO DA PROPRIEDADE RURAL' }]);
        const r = await useCase().execute('registrations', {
            courseIds: 'c1',
            confirmed: 'true',
            fields: 'ordinal,name,cpf,signature',
            modelo: 'lista-presenca',
            format: 'pdf',
        });
        expect(repo.courseNames).toHaveBeenCalledWith(['c1']);
        expect(r.result!.pdf!.filters).toBe('Curso: GESTÃO DA PROPRIEDADE RURAL · Só confirmadas');
        expect(r.result!.auditDetails!.filtros).toEqual([
            { nome: 'Curso',
valor: 'GESTÃO DA PROPRIEDADE RURAL' },
            { nome: 'Só confirmadas',
valor: 'Sim' },
        ]);
        expect(r.result!.auditLabel).toBe('Inscrições: 0 registros (com filtros) · PDF · com CPF');
    });

    it('um dos cursos sem linha: os nomes vêm pelo id; curso não achado ou mais de 3 → a quantidade', async () => {
        vi.mocked(repo.registrations).mockResolvedValue([registration('r1', {})] as never);
        vi.mocked(repo.courseNames).mockResolvedValue([{ id: 'c1',
name: 'HORTA' }, { id: 'c2',
name: 'CURSO B' }]);
        const two = await useCase().execute('registrations', { courseIds: 'c1,c2,c1',
format: 'pdf' });
        expect(repo.courseNames).toHaveBeenCalledWith(['c1', 'c2']);
        expect(two.result!.pdf!.filters).toBe('Cursos: HORTA, CURSO B');

        vi.mocked(repo.registrations).mockResolvedValue([] as never);
        vi.mocked(repo.courseNames).mockResolvedValue([]);
        const missing = await useCase().execute('registrations', { courseIds: 'sumiu',
format: 'pdf' });
        expect(missing.result!.pdf!.filters).toBe('Cursos: 1');

        vi.mocked(repo.courseNames).mockClear();
        const many = await useCase().execute('registrations', { courseIds: 'a,b,c,d',
format: 'pdf' });
        expect(many.result!.pdf!.filters).toBe('Cursos: 4');
        expect(repo.courseNames).not.toHaveBeenCalled();
    });
});

describe('montador: auditoria', () => {
    it('o alvo diz o formato e os campos pessoais (documentos primeiro, até 5); os detalhes dizem tudo', async () => {
        vi.mocked(repo.people).mockResolvedValue([person(), person({ id: 'p2' })] as never);
        const r = await useCase().execute('people', {
            fields: ['name', 'email', 'phone', 'birthDate', 'ethnicity', 'addressCity', 'cpf'],
            format: 'pdf',
            modelo: 'contato',
            search: 'silva',
        });
        expect(r.result!.auditLabel).toBe(
            'Pessoas: 2 registros (com filtros) · PDF · com CPF, E-mail, Telefone, Nascimento, Etnia e mais 1',
        );
        expect(r.result!.auditDetails).toEqual({
            formato: 'pdf',
            modelo: 'Contato',
            campos: ['Nome', 'E-mail', 'Telefone', 'Nascimento', 'Etnia', 'Endereço: Cidade', 'CPF'],
            escopo: 'com filtros',
            filtros: [{ nome: 'Busca',
valor: 'silva' }],
            linhas: 2,
        });
    });

    it('seleção: um registro pelo nome; sem campo pessoal, o alvo não cita nada', async () => {
        vi.mocked(repo.people).mockResolvedValue([person()] as never);
        const r = await useCase().execute('people', { ids: ['p1'],
fields: ['name', 'memberType'] });
        expect(r.result!.auditLabel).toBe('Pessoas: JOÃO DA SILVA · CSV');
        expect(r.result!.filename).toBe('pessoa-joao-da-silva-2026-09-17.csv');
        expect(r.result!.auditDetails).toMatchObject({
            escopo: 'seleção',
            filtros: [{ nome: 'Seleção',
valor: '1 registro' }],
            modelo: null,
        });
    });

    it('citedPersonalFields corta em 5 e diz quantos sobraram', () => {
        const fields = EXPORT_SOURCES.people.fields.filter(f => ['cpf', 'rg', 'email', 'phone', 'phone2', 'phone3', 'name'].includes(f.key));
        expect(citedPersonalFields(fields)).toBe('CPF, RG, E-mail, Telefone, Telefone 2 e mais 1');
        expect(citedPersonalFields(fields.filter(f => f.key === 'name'))).toBe('');
    });
});

describe('máscaras', () => {
    it('telefone com DDD (10 ou 11 dígitos) ganha máscara; outro tamanho sai como gravado', () => {
        expect(formatPhone('44999998888')).toBe('(44) 99999-8888');
        expect(formatPhone('(44) 9 9999-8888')).toBe('(44) 99999-8888');
        expect(formatPhone('4436451234')).toBe('(44) 3645-1234');
        expect(formatPhone('99998888')).toBe('99998888');
        expect(formatPhone(null)).toBe('');
    });

    it('CNS com 15 dígitos ganha espaços', () => {
        expect(formatCns('123456789012345')).toBe('123 4567 8901 2345');
        expect(formatCns('123')).toBe('123');
    });
});
