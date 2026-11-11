import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExportDataUseCase } from '../export-data.js';
import type { ExportRepository } from '../../ports/external/export-repository.js';

// Teste de ouro da fase 2, parte B, do montador de relatórios (decisão 006,
// item 8; SR-102): o CSV padrão de cada fonte que ainda sai pelo caminho
// antigo, byte a byte, com dados fixos. Cada bloco foi escrito e commitado
// ANTES de a fonte dele sair do caminho antigo (`export-data.ts`): sem
// `fields`, a planilha tem de continuar exatamente igual. Se um bloco quebrar,
// a planilha de hoje mudou.
//
// Como nos testes de ouro anteriores, as linhas esperadas estão escritas à
// mão, célula por célula, já como saem no arquivo (aspas internas dobradas,
// fórmula com apóstrofo). Nada de snapshot em arquivo (o `core.autocrlf`
// trocaria o "\r\n").

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

beforeEach(() => vi.clearAllMocks());

// ── Auditoria ────────────────────────────────────────────────────────────────

const AUDIT_HEADER = ['Data e hora', 'Quem', 'Ação', 'Área', 'Alvo', 'Caminho', 'IP', 'Local', 'Aparelho', 'Alterações'];

const CHROME_WINDOWS =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const SAFARI_IPHONE =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

/** Exportação em PDF do montador: a coluna "Ação" diz "relatório em PDF". */
const exportPdf = {
    id: 'l1',
    method: 'EXPORT',
    path: '/admin/export/people',
    entity: 'Exportação',
    targetLabel: 'Pessoas: 3 registros (com filtros) · PDF · com CPF',
    ip: '200.1.2.3',
    userAgent: CHROME_WINDOWS,
    location: 'Terra Roxa, PR, Brasil',
    changes: null,
    details: {
        formato: 'pdf',
        modelo: 'Nome e CPF',
        campos: ['Nome', 'CPF'],
        escopo: 'com filtros',
        filtros: [{ nome: 'Busca',
valor: 'silva' }],
        linhas: 3,
    },
    createdAt: d('2026-09-17T13:00:00.000Z'),
    actorName: 'bali',
};

/** Exportação em CSV, com e sem `details` (linha antiga): "planilha". */
const exportCsv = {
    ...exportPdf,
    id: 'l2',
    targetLabel: 'Pessoas: 3 registros (todos) · CSV',
    details: { ...exportPdf.details,
formato: 'csv',
modelo: null,
escopo: 'todos',
filtros: [] },
    createdAt: d('2026-09-17T12:59:00.000Z'),
};
const exportOld = {
    ...exportPdf,
    id: 'l3',
    path: '/admin/export/room-bookings',
    targetLabel: 'Reservas de sala: 2 registros (com filtros)',
    details: null,
    ip: null,
    location: null,
    userAgent: null,
    createdAt: d('2026-09-16T10:00:00.000Z'),
};

/** Edição com alterações; quem fez não existe mais ("—"); alvo com aspas e fórmula. */
const edit = {
    id: 'l4',
    method: 'PATCH',
    path: '/users/0b9f6a52-4d0f-4c1e-9d55-6b5f3c2a1e10',
    entity: 'Usuário',
    targetLabel: '=JOÃO "J"',
    ip: '10.0.0.1',
    userAgent: 'curl/8.4.0',
    location: 'Curitiba, PR, Brasil',
    changes: [
        { field: 'email',
before: 'a@x.com',
after: null },
        { field: 'phone',
before: '44999990000',
after: '44988880000' },
        { field: 'birthDate',
before: null,
after: '1980-05-10' },
    ],
    details: null,
    createdAt: d('2026-01-02T02:05:00.000Z'),
    actorName: '—',
};

/** Login que falhou, sem quem (público), pelo celular. */
const loginFailed = {
    id: 'l5',
    method: 'LOGIN_FAILED',
    path: '/auth/login',
    entity: 'Login',
    targetLabel: '(usuário inexistente)',
    ip: '177.10.20.30',
    userAgent: SAFARI_IPHONE,
    location: 'Toledo, PR, Brasil',
    changes: null,
    details: null,
    createdAt: d('2025-12-31T23:30:00.000Z'),
    actorName: 'Público',
};

/** Excluir a reserva "e as próximas da série" (?scope=future), sem alvo. */
const deleteSeries = {
    id: 'l6',
    method: 'DELETE',
    path: '/admin/room-bookings/7c1d1a0e-1f0e-4d7b-9a51-2f8e3b4c5d60?scope=future',
    entity: 'Reserva de sala',
    targetLabel: null,
    ip: '200.1.2.3',
    userAgent: '',
    location: null,
    changes: [{ field: 'title',
before: 'REUNIÃO; DIRETORIA',
after: null }],
    details: null,
    createdAt: d('2025-06-01T15:00:00.000Z'),
    actorName: 'bali',
};

const EXPORT_PDF_ROW = [
    '17/09/2026 10:00', 'bali', 'Exportou um relatório em PDF', 'Exportação',
    'Pessoas: 3 registros (com filtros) · PDF · com CPF', '/admin/export/people', '200.1.2.3', 'Terra Roxa, PR, Brasil',
    'Chrome no Windows', '',
];
const EXPORT_CSV_ROW = [
    '17/09/2026 09:59', 'bali', 'Exportou uma planilha', 'Exportação', 'Pessoas: 3 registros (todos) · CSV',
    '/admin/export/people', '200.1.2.3', 'Terra Roxa, PR, Brasil', 'Chrome no Windows', '',
];
const EXPORT_OLD_ROW = [
    '16/09/2026 07:00', 'bali', 'Exportou uma planilha', 'Exportação', 'Reservas de sala: 2 registros (com filtros)',
    '/admin/export/room-bookings', '', '', '', '',
];
const EDIT_ROW = [
    '01/01/2026 23:05', '—', 'Editou um usuário', 'Usuário', `'=JOÃO ""J""`, '/users/0b9f6a52-4d0f-4c1e-9d55-6b5f3c2a1e10',
    '10.0.0.1', 'Curitiba, PR, Brasil', 'curl',
    'E-mail: a@x.com → (vazio); Telefone: 44999990000 → 44988880000; birthDate: (vazio) → 1980-05-10',
];
const LOGIN_FAILED_ROW = [
    '31/12/2025 20:30', 'Público', 'Tentativa de login falhou', 'Login', '(usuário inexistente)', '/auth/login',
    '177.10.20.30', 'Toledo, PR, Brasil', 'Safari no iPhone', '',
];
const DELETE_SERIES_ROW = [
    '01/06/2025 12:00', 'bali', 'Excluiu uma reserva de sala e as próximas da série', 'Reserva de sala', '',
    '/admin/room-bookings/7c1d1a0e-1f0e-4d7b-9a51-2f8e3b4c5d60?scope=future', '200.1.2.3', '', '',
    'Título: REUNIÃO; DIRETORIA → (vazio)',
];

describe('teste de ouro: CSV padrão da auditoria', () => {
    it('10 colunas, na ordem e no formato de hoje, na ordem que o repositório entrega', async () => {
        expect(AUDIT_HEADER).toHaveLength(10);
        for (const row of [EXPORT_PDF_ROW, EXPORT_CSV_ROW, EXPORT_OLD_ROW, EDIT_ROW, LOGIN_FAILED_ROW, DELETE_SERIES_ROW]) {
            expect(row).toHaveLength(10);
        }

        vi.mocked(repo.auditLogs).mockResolvedValue([exportPdf, exportCsv, exportOld, edit, loginFailed, deleteSeries] as never);
        const r = await useCase().execute('audit-logs', {});
        expect(r.error).toBeUndefined();
        expect(r.result!.csv).toBe(
            file(AUDIT_HEADER, EXPORT_PDF_ROW, EXPORT_CSV_ROW, EXPORT_OLD_ROW, EDIT_ROW, LOGIN_FAILED_ROW, DELETE_SERIES_ROW),
        );
        expect(r.result!.count).toBe(6);
        expect(r.result!.filename).toBe('auditoria-2026-09-17.csv');
    });

    it('os filtros da tela chegam ao repositório; a página da lista não vira filtro', async () => {
        vi.mocked(repo.auditLogs).mockResolvedValue([edit] as never);
        const filters = {
            action: 'edit',
            entity: 'Usuário',
            actorId: 'a1',
            ip: '10.0.0.1',
            from: '2026-01-01',
            to: '2026-01-31',
            q: 'joão',
        };
        const r = await useCase().execute('audit-logs', { ...filters,
page: '3' });
        expect(r.result!.csv).toBe(file(AUDIT_HEADER, EDIT_ROW));
        expect(r.result!.filename).toBe('auditoria-2026-09-17.csv');
        expect(repo.auditLogs).toHaveBeenCalledWith(expect.objectContaining(filters));
        expect(vi.mocked(repo.auditLogs).mock.calls[0][0]).not.toHaveProperty('page');
    });

    it('lista vazia: só o cabeçalho', async () => {
        vi.mocked(repo.auditLogs).mockResolvedValue([] as never);
        const r = await useCase().execute('audit-logs', { action: 'login_failed' });
        expect(r.result!.csv).toBe(file(AUDIT_HEADER));
        expect(r.result!.count).toBe(0);
    });

    it('filtro inválido → 400, sem consultar', async () => {
        for (const query of [{ action: 'tudo' }, { from: 'ontem' }]) {
            const r = await useCase().execute('audit-logs', query);
            expect(r.error!.message).toBeTruthy();
            expect(repo.auditLogs).not.toHaveBeenCalled();
        }
    });
});
