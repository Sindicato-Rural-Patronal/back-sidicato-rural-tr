import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExportDataUseCase } from '../export-data.js';
import type { ExportRepository } from '../../ports/external/export-repository.js';
import { PDF_DO_NAVEGADOR_MESSAGE, readPdfDoNavegador } from '../export/engine.js';

// `pdfDoNavegador` (SR-125): o painel monta o PDF no navegador a partir do CSV.
// A resposta é o mesmo CSV; só a trilha de auditoria diz PDF.

const repo = {
    people: vi.fn(),
    companies: vi.fn(),
    admins: vi.fn(),
    logExport: vi.fn(),
} as unknown as ExportRepository;

// 17/09/2026 10:00 em Brasília.
const now = () => new Date('2026-09-17T13:00:00.000Z');
const useCase = () => new ExportDataUseCase(repo, now);

beforeEach(() => {
    vi.clearAllMocks();
    (repo.people as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (repo.companies as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (repo.admins as ReturnType<typeof vi.fn>).mockResolvedValue([]);
});

describe('readPdfDoNavegador', () => {
    it('ausente, null e false = como sempre', () => {
        expect(readPdfDoNavegador(undefined, 'csv')).toBe(false);
        expect(readPdfDoNavegador(null, 'xlsx')).toBe(false);
        expect(readPdfDoNavegador(false, 'csv')).toBe(false);
        expect(readPdfDoNavegador('false', 'pdf')).toBe(false);
    });

    it('true e "true" valem só com o CSV', () => {
        expect(readPdfDoNavegador(true, 'csv')).toBe(true);
        expect(readPdfDoNavegador('true', 'csv')).toBe(true);
        for (const format of ['xlsx', 'pdf'] as const) {
            const r = readPdfDoNavegador(true, format);
            expect(r).toBeInstanceOf(Error);
            expect((r as Error).message).toBe(PDF_DO_NAVEGADOR_MESSAGE);
        }
    });

    it('o que não é boolean → "Parâmetro inválido"', () => {
        for (const v of ['sim', 'TRUE', 1, 0, {}, []]) {
            const r = readPdfDoNavegador(v, 'csv');
            expect(r, String(v)).toBeInstanceOf(Error);
            expect((r as Error).message).toBe('Parâmetro inválido: pdfDoNavegador');
        }
    });
});

describe('exportação de lista (people)', () => {
    it('o mesmo CSV; a auditoria diz PDF', async () => {
        const normal = await useCase().execute('people', { format: 'csv' });
        const pdf = await useCase().execute('people', { format: 'csv',
pdfDoNavegador: true });
        expect(pdf.error).toBeUndefined();
        expect(pdf.result!.format).toBe('csv');
        expect(pdf.result!.csv).toBe(normal.result!.csv);
        expect(pdf.result!.filename).toBe(normal.result!.filename);
        expect(pdf.result!.count).toBe(normal.result!.count);

        expect(normal.result!.auditLabel).toBe('Pessoas: 0 registros (todos) · CSV');
        expect(normal.result!.auditDetails).toMatchObject({ formato: 'csv' });
        expect(pdf.result!.auditLabel).toBe('Pessoas: 0 registros (todos) · PDF');
        expect(pdf.result!.auditDetails).toEqual({ ...normal.result!.auditDetails,
formato: 'pdf' });
    });

    it('false e ausente = o de hoje', async () => {
        const normal = await useCase().execute('people', {});
        const falso = await useCase().execute('people', { pdfDoNavegador: false });
        expect(falso.result).toEqual(normal.result);
    });

    it('com xlsx ou pdf → 400, sem consultar o banco', async () => {
        for (const format of ['xlsx', 'pdf']) {
            const r = await useCase().execute('people', { format,
pdfDoNavegador: true });
            expect(r.error?.message).toBe(PDF_DO_NAVEGADOR_MESSAGE);
            expect(r.result).toBeUndefined();
        }
        expect(repo.people).not.toHaveBeenCalled();
    });

    it('valor que não é boolean → 400', async () => {
        const r = await useCase().execute('people', { pdfDoNavegador: 'talvez' });
        expect(r.error?.message).toBe('Parâmetro inválido: pdfDoNavegador');
    });
});

describe('relatório de cadastros', () => {
    it('o mesmo CSV; a auditoria diz PDF e ganha details', async () => {
        const normal = await useCase().execute('cadastros', {});
        const pdf = await useCase().execute('cadastros', { format: 'csv',
pdfDoNavegador: true });
        expect(pdf.error).toBeUndefined();
        expect(pdf.result!.format).toBe('csv');
        expect(pdf.result!.csv).toBe(normal.result!.csv);
        expect(pdf.result!.filename).toBe(normal.result!.filename);

        expect(normal.result!.auditLabel).toBe('Relatório de cadastros: 0 registros (todos)');
        expect(normal.result!.auditDetails).toBeNull();
        expect(pdf.result!.auditLabel).toBe('Relatório de cadastros: 0 registros (todos) · PDF');
        expect(pdf.result!.auditDetails).toEqual({
            formato: 'pdf',
modelo: null,
campos: [],
escopo: 'todos',
filtros: [],
linhas: 0,
        });
    });

    it('false = como hoje; xlsx ou pdf com true → 400', async () => {
        const normal = await useCase().execute('cadastros', {});
        expect((await useCase().execute('cadastros', { pdfDoNavegador: false })).result).toEqual(normal.result);
        for (const format of ['xlsx', 'pdf']) {
            const r = await useCase().execute('cadastros', { format,
pdfDoNavegador: true });
            expect(r.error?.message).toBe(PDF_DO_NAVEGADOR_MESSAGE);
        }
        const bad = await useCase().execute('cadastros', { pdfDoNavegador: 1 });
        expect(bad.error?.message).toBe('Parâmetro inválido: pdfDoNavegador');
    });
});
