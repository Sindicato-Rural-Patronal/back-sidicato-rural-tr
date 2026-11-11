import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExportDataUseCase } from '../export-data.js';
import type { ExportRepository } from '../../ports/external/export-repository.js';
import { EXPORT_SOURCES } from '../export/catalog/index.js';
import { GetExportCatalogUseCase } from '../export/get-export-catalog.js';
import type { ExportActor } from '../export/engine.js';

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
