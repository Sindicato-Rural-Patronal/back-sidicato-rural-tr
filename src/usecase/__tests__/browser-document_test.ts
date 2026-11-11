import { describe, it, expect } from 'vitest';
import { LogBrowserDocumentUseCase } from '../export/browser-document.js';
import {
    BROWSER_DOCUMENTS, BROWSER_DOCUMENT_KINDS, browserDocumentOfPath, isBrowserDocumentKind, type BrowserDocumentKind,
} from '../../lib/browser-documents.js';
import { describeAuditAction } from '../../lib/audit-sentence.js';
import { describeExportDetails } from '../export/catalog/audit-logs.js';
import { ValidationError } from '../../errors/validation.js';

// Documentos montados no navegador na auditoria (SR-104): o alvo, os detalhes
// no formato da exportação, a frase e a validação do corpo.

const useCase = new LogBrowserDocumentUseCase();
const run = (kind: BrowserDocumentKind, body: unknown) => useCase.execute(kind, body);

describe('a lista de documentos', () => {
    it('os tipos fechados, com nome e a permissão do documento', () => {
        expect(BROWSER_DOCUMENT_KINDS).toEqual([
            'lista-presenca', 'ficha-inscricao', 'agenda', 'financeiro', 'relatorio-despesas', 'nota-empenho', 'recibo',
            'unimed-ficha', 'unimed-termo-adesao', 'unimed-contrato', 'relatorio-cadastros',
        ]);
        expect(BROWSER_DOCUMENTS['lista-presenca'].permissions).toEqual(['READ_COURSE']);
        expect(BROWSER_DOCUMENTS['ficha-inscricao'].permissions).toEqual(['READ_COURSE', 'READ_USER']);
        expect(BROWSER_DOCUMENTS.agenda.permissions).toEqual(['READ_COURSE']);
        for (const k of ['financeiro', 'relatorio-despesas', 'nota-empenho', 'recibo'] as const) {
            expect(BROWSER_DOCUMENTS[k].permissions).toEqual(['READ_FINANCE']);
        }
        for (const k of ['unimed-ficha', 'unimed-termo-adesao', 'unimed-contrato'] as const) {
            expect(BROWSER_DOCUMENTS[k].permissions).toEqual(['READ_USER']);
        }
        expect(BROWSER_DOCUMENTS['relatorio-cadastros'].permissions).toEqual(['READ_USER_ADMIN', 'READ_USER']);
        const names = BROWSER_DOCUMENT_KINDS.map(k => BROWSER_DOCUMENTS[k].name);
        expect(new Set(names).size).toBe(names.length);
    });

    it('tipo pelo caminho gravado; o resto não é documento', () => {
        expect(browserDocumentOfPath('/admin/export/documents/lista-presenca')).toBe('lista-presenca');
        expect(browserDocumentOfPath('/admin/export/documents/recibo?x=1')).toBe('recibo');
        expect(browserDocumentOfPath('/admin/export/documents/senhas')).toBeNull();
        expect(browserDocumentOfPath('/admin/export/people')).toBeNull();
        expect(isBrowserDocumentKind('toString')).toBe(false);
        expect(isBrowserDocumentKind('agenda')).toBe(true);
    });
});

describe('a linha da auditoria', () => {
    it('lista de presença: alvo com o curso, os registros e o CPF; detalhes sem campos', () => {
        const r = run('lista-presenca', { alvo: '  HORTA  ',
ids: ['c1'],
linhas: 12 });
        expect(r.error).toBeUndefined();
        expect(r.log).toEqual({
            path: '/admin/export/documents/lista-presenca',
            targetLabel: 'Lista de presença: HORTA · 12 registros · com CPF',
            details: {
                formato: 'pdf',
                modelo: 'Lista de presença',
                campos: [],
                escopo: 'seleção',
                filtros: [],
                linhas: 12,
                documento: 'lista-presenca',
                alvo: 'HORTA',
                ids: ['c1'],
            },
        });
    });

    it('sem alvo nem ids: o nome do documento e escopo "todos"; documento sem dado pessoal não cita nada', () => {
        const r = run('financeiro', { linhas: 1 });
        expect(r.log!.targetLabel).toBe('Relatório do Financeiro · 1 registro');
        expect(r.log!.details).toEqual({
            formato: 'pdf',
            modelo: 'Relatório do Financeiro',
            campos: [],
            escopo: 'todos',
            filtros: [],
            linhas: 1,
            documento: 'financeiro',
        });
    });

    it('escopo dito pelo painel vale; mais de 5 dados pessoais vira "e mais N"', () => {
        const agenda = run('agenda', { alvo: '05/10/2026 a 11/10/2026',
linhas: 0,
escopo: 'com filtros' });
        expect(agenda.log!.details.escopo).toBe('com filtros');
        // 0 registros: nenhum dado saiu, o alvo não cita o Responsável (SR-112).
        expect(agenda.log!.targetLabel).toBe('Agenda: 05/10/2026 a 11/10/2026 · 0 registros');
        const ficha = run('ficha-inscricao', { alvo: 'HORTA',
linhas: 30 });
        expect(ficha.log!.targetLabel).toBe('Ficha de inscrição: HORTA · 30 registros · com CPF, Nascimento, Telefone, E-mail, Endereço e mais 2');
    });

    it('com 0 registros o alvo não cita dado pessoal; com 1, cita (SR-112)', () => {
        expect(run('lista-presenca', { alvo: 'HORTA',
linhas: 0 }).log!.targetLabel).toBe('Lista de presença: HORTA · 0 registros');
        expect(run('lista-presenca', { alvo: 'HORTA',
linhas: 1 }).log!.targetLabel).toBe('Lista de presença: HORTA · 1 registro · com CPF');
        const empty = run('unimed-ficha', { linhas: 0 });
        expect(empty.log!.targetLabel).toBe('Ficha da Unimed · 0 registros');
        expect(empty.log!.details).toMatchObject({ linhas: 0,
documento: 'unimed-ficha' });
    });

    it('a contagem tem milhar, como a tela; nos detalhes, "linhas" continua número (SR-112)', () => {
        const { log } = run('financeiro', { alvo: '01/01/2026 a 31/12/2026',
linhas: 12345 });
        expect(log!.targetLabel).toBe('Relatório do Financeiro: 01/01/2026 a 31/12/2026 · 12.345 registros');
        expect(log!.details.linhas).toBe(12345);
        expect(describeExportDetails(log!.details)).toBe('Formato: PDF; Modelo: Relatório do Financeiro; Escopo: todos; Linhas: 12.345');
    });

    it('a frase: "Gerou o documento"; sem o alvo, diz qual', () => {
        const { log } = run('nota-empenho', { alvo: 'Nº 123 · COOP LTDA',
ids: ['t1'],
linhas: 1 });
        const entry = { method: 'EXPORT',
path: log!.path,
entity: 'Exportação',
details: log!.details };
        expect(describeAuditAction({ ...entry,
targetLabel: log!.targetLabel }))
            .toBe('Gerou o documento "Nota de Empenho: Nº 123 · COOP LTDA · 1 registro · com CNPJ / CPF, Endereço, Telefone, Banco"');
        expect(describeAuditAction({ ...entry,
targetLabel: null })).toBe('Gerou o documento "Nota de Empenho"');
        // Detalhes da exportação na planilha da auditoria.
        expect(describeExportDetails(log!.details)).toBe('Formato: PDF; Modelo: Nota de Empenho; Escopo: seleção; Linhas: 1');
    });
});

describe('corpo inválido → 400', () => {
    const cases: [string, unknown, string][] = [
        ['sem linhas', {}, 'Informe o número de registros do documento (linhas).'],
        ['linhas negativa', { linhas: -1 }, 'O número de registros (linhas) não pode ser negativo.'],
        ['linhas quebrada', { linhas: 1.5 }, 'O número de registros (linhas) é um inteiro.'],
        ['linhas demais', { linhas: 100_001 }, 'No máximo 100000 registros por documento.'],
        ['ids vazio', { linhas: 1,
ids: [] }, 'Lista de ids vazia: mande os ids ou tire o campo.'],
        ['ids demais', { linhas: 1,
ids: Array.from({ length: 1001 }, (_, i) => `id${i}`) }, 'No máximo 1000 ids por documento.'],
        ['alvo longo', { linhas: 1,
alvo: 'x'.repeat(121) }, 'O alvo aceita até 120 caracteres.'],
        ['escopo estranho', { linhas: 1,
escopo: 'tudo' }, 'Escopo inválido: use seleção, com filtros ou todos.'],
    ];
    for (const [name, body, message] of cases) {
        it(name, () => {
            const r = run('recibo', body);
            expect(r.error).toBeInstanceOf(ValidationError);
            expect(r.error!.message).toBe(message);
            expect(r.log).toBeUndefined();
        });
    }

    it('tipo desconhecido (chamada fora da rota)', () => {
        expect(run('senhas' as BrowserDocumentKind, { linhas: 1 }).error!.message).toBe('Documento desconhecido.');
        expect(run('toString' as BrowserDocumentKind, { linhas: 1 }).error!.message).toBe('Documento desconhecido.');
    });
});
