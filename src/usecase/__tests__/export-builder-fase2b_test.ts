import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExportDataUseCase } from '../export-data.js';
import type { ExportRepository } from '../../ports/external/export-repository.js';
import { EXPORT_SOURCES } from '../export/catalog/index.js';
import { describeExportDetails } from '../export/catalog/audit-logs.js';
import { GetExportCatalogUseCase } from '../export/get-export-catalog.js';
import type { ExportActor } from '../export/engine.js';

// Montador de relatórios, fase 2, parte B (decisão 006; SR-102): as fontes que
// saíram do caminho antigo por último. O padrão de cada uma é congelado pelo
// teste de ouro (`export-golden-fase2b_test.ts`); aqui ficam o catálogo, os
// campos escolhidos, o PDF, os filtros em palavras e a auditoria.

const repo = {
    people: vi.fn(),
    companies: vi.fn(),
    properties: vi.fn(),
    admins: vi.fn(),
    ruleName: vi.fn(),
    courses: vi.fn(),
    registrations: vi.fn(),
    courseNames: vi.fn(),
    contactMessages: vi.fn(),
    unimed: vi.fn(),
    auditLogs: vi.fn(),
    adminUsername: vi.fn(),
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

// ── Auditoria ────────────────────────────────────────────────────────────────

function auditRow(overrides: Record<string, unknown> = {}) {
    return {
        id: 'l1',
        method: 'EXPORT',
        path: '/admin/export/people',
        entity: 'Exportação',
        targetLabel: 'Pessoas: 3 registros (com filtros) · PDF · com CPF',
        ip: '200.1.2.3',
        userAgent: 'curl/8.4.0',
        location: 'Terra Roxa, PR, Brasil',
        changes: null,
        details: {
            formato: 'pdf',
            modelo: 'Nome e CPF',
            campos: ['Nome', 'CPF'],
            escopo: 'com filtros',
            filtros: [{ nome: 'Busca',
valor: '=silva' }, { nome: 'Só associados em dia',
valor: 'Sim' }],
            linhas: 3,
        },
        createdAt: new Date('2026-09-17T13:00:00.000Z'),
        actorName: 'bali',
        ...overrides,
    };
}

describe('auditoria no montador', () => {
    it('catálogo: grupos, padrão de 10 colunas, modelo Resumida; IP, local e aparelho pessoais', () => {
        const source = EXPORT_SOURCES['audit-logs'];
        expect(source.padrao).toEqual(['createdAt', 'actor', 'action', 'entity', 'target', 'path', 'ip', 'location', 'device', 'changes']);
        expect(groupsOf('audit-logs')).toEqual(['Registro', 'De onde veio', 'Detalhes', 'Relatório']);
        // "Detalhes da exportação" é campo novo, fora do padrão.
        expect(keysOf('audit-logs')).toEqual(expect.arrayContaining(['exportDetails', 'ordinal', 'signature']));
        expect(source.padrao).not.toContain('exportDetails');
        expect(source.fields.filter(f => f.permission)).toEqual([]);
        expect(source.modelos).toEqual([{ id: 'resumida',
name: 'Resumida',
fields: ['createdAt', 'actor', 'action', 'target'] }]);
        const privacy = new Map(source.fields.map(f => [f.key, f.privacy]));
        for (const key of ['ip', 'location', 'device']) expect(privacy.get(key), key).toBe('pessoal');
        for (const key of ['createdAt', 'actor', 'action', 'entity', 'target', 'path', 'changes', 'exportDetails']) {
            expect(privacy.get(key), key).toBe('comum');
        }

        const catalog = new GetExportCatalogUseCase().execute('audit-logs', can('READ_AUDIT')).catalog!;
        expect(catalog).toMatchObject({
            dataset: 'audit-logs',
            title: 'Auditoria',
            filterLabels: { action: 'Ação',
entity: 'Área',
actorId: 'Quem',
ip: 'IP',
from: 'De',
to: 'Até',
q: 'Busca' },
        });
        expect(catalog.groups.flatMap(g => g.fields).every(f => f.allowed)).toBe(true);
    });

    it('"Detalhes da exportação": o que saiu numa célula; linha sem detalhes fica vazia', async () => {
        vi.mocked(repo.auditLogs).mockResolvedValue([
            auditRow(),
            auditRow({ id: 'l2',
method: 'PATCH',
path: '/users/x',
entity: 'Usuário',
targetLabel: 'JOÃO',
details: null }),
        ] as never);
        const r = await useCase().execute('audit-logs', { fields: ['ordinal', 'actor', 'exportDetails'] });
        expect(r.error).toBeUndefined();
        expect(parse(r.result!.csv)).toEqual([
            ['Nº de ordem', 'Quem', 'Detalhes da exportação'],
            ['1', 'bali', 'Formato: PDF; Modelo: Nome e CPF; Campos: Nome, CPF; Escopo: com filtros; Filtros: Busca: =silva, Só associados em dia; Linhas: 3'],
            ['2', 'bali', ''],
        ]);
    });

    it('describeExportDetails: seleção, sem modelo nem filtros; valor estranho no JSON não quebra', () => {
        expect(describeExportDetails({
            formato: 'csv',
            modelo: null,
            campos: ['Nome'],
            escopo: 'seleção',
            filtros: [{ nome: 'Seleção',
valor: '8 registros' }],
            linhas: 8,
        })).toBe('Formato: CSV; Campos: Nome; Escopo: seleção; Filtros: Seleção: 8 registros; Linhas: 8');
        expect(describeExportDetails({ formato: 'csv',
campos: 'Nome',
filtros: [null, 3],
linhas: '2' })).toBe('Formato: CSV');
        for (const value of [null, undefined, 'pdf', [], {}, { formato: 3 }]) expect(describeExportDetails(value)).toBeNull();
    });

    it('PDF: ação, área, quem, IP, período e busca em palavras; o modelo pelo nome', async () => {
        vi.mocked(repo.auditLogs).mockResolvedValue([auditRow()] as never);
        const r = await useCase().execute('audit-logs', {
            fields: ['createdAt', 'actor', 'action', 'target'],
            format: 'pdf',
            modelo: 'resumida',
            action: 'export',
            entity: 'Exportação',
            actorId: 'a1',
            ip: '200.1.2.3',
            from: '2026-09-01',
            to: '2026-09-17',
            q: 'pessoas',
        });
        expect(r.error).toBeUndefined();
        expect(r.result!.pdf).toMatchObject({
            title: 'Auditoria',
            filename: 'auditoria-2026-09-17.pdf',
            count: 1,
            filters: 'Ação: Exportações · Área: Exportação · Quem: bali · IP: 200.1.2.3 · Período: 01/09/2026 a 17/09/2026 · Busca: pessoas',
            modelo: 'Resumida',
            rows: [['17/09/2026 10:00', 'bali', 'Exportou um relatório em PDF', 'Pessoas: 3 registros (com filtros) · PDF · com CPF']],
        });
        // O usuário veio da linha: não precisou consultar.
        expect(repo.adminUsername).not.toHaveBeenCalled();
    });

    it('filtro "Quem" sem nenhuma linha: o usuário pelo id; um dia só; só uma ponta do período', async () => {
        vi.mocked(repo.auditLogs).mockResolvedValue([] as never);
        vi.mocked(repo.adminUsername).mockResolvedValue('maria' as never);
        const quem = await useCase().execute('audit-logs', { format: 'pdf',
actorId: 'a2',
from: '2026-09-17',
to: '2026-09-17' });
        expect(quem.result!.pdf!.filters).toBe('Quem: maria · Dia: 17/09/2026');
        expect(repo.adminUsername).toHaveBeenCalledWith('a2');

        vi.mocked(repo.adminUsername).mockResolvedValue(null as never);
        const sumiu = await useCase().execute('audit-logs', { format: 'pdf',
actorId: 'x9',
to: '2026-09-17' });
        expect(sumiu.result!.pdf!.filters).toBe('Quem: x9 · Até: 17/09/2026');
        const de = await useCase().execute('audit-logs', { format: 'pdf',
from: '2026-09-01' });
        expect(de.result!.pdf!.filters).toBe('De: 01/09/2026');
    });

    it('auditoria da exportação: o alvo diz o formato e cita IP, local e aparelho', async () => {
        vi.mocked(repo.auditLogs).mockResolvedValue([auditRow(), auditRow({ id: 'l2' })] as never);
        const padrao = await useCase().execute('audit-logs', { action: 'export' });
        expect(padrao.result!.auditLabel).toBe('Auditoria: 2 registros (com filtros) · CSV · com IP, Local, Aparelho');
        expect(padrao.result!.auditDetails).toMatchObject({
            formato: 'csv',
            modelo: 'Padrão (como hoje)',
            escopo: 'com filtros',
            filtros: [{ nome: 'Ação',
valor: 'Exportações' }],
            linhas: 2,
        });
        const resumida = await useCase().execute('audit-logs', { fields: 'createdAt,actor,action,target' });
        expect(resumida.result!.auditLabel).toBe('Auditoria: 2 registros (todos) · CSV');
    });

    it('PDF com mais de 2.000 linhas → 400; a trilha não tem seleção (ids é ignorado)', async () => {
        vi.mocked(repo.auditLogs).mockResolvedValue(Array.from({ length: 2001 }, (_, i) => auditRow({ id: `l${i}` })) as never);
        const pdf = await useCase().execute('audit-logs', { format: 'pdf' });
        expect(pdf.error!.message).toBe('O PDF aceita até 2.000 linhas. Baixe a planilha ou use um filtro.');
        const csv = await useCase().execute('audit-logs', { ids: ['l1'] });
        expect(csv.result!.count).toBe(2001);
        expect(csv.result!.filename).toBe('auditoria-2026-09-17.csv');
        expect(vi.mocked(repo.auditLogs).mock.calls[1][0]).not.toHaveProperty('ids');
    });
});
