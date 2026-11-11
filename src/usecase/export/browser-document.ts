import { z } from 'zod';
import type { ExportAuditLogDetails } from '../../ports/external/export-repository.js';
import { ValidationError } from '../../errors/validation.js';
import {
    BROWSER_DOCUMENTS, BROWSER_DOCUMENTS_PATH, isBrowserDocumentKind, type BrowserDocumentKind,
} from '../../lib/browser-documents.js';

// Linha da auditoria de um documento montado no navegador (SR-104, decisão
// 006, item 7.5): lista de presença, fichas, Agenda, PDFs do Financeiro e da
// Unimed, relatório de cadastros em PDF. O painel avisa ao gerar; aqui só se
// monta o alvo e os detalhes, no mesmo formato da exportação, sem campos (o
// documento é fixo).

export const DOCUMENT_LIMITS = {
    /** Ids por documento ("Exportar todas as fichas" manda as do curso). */
    ids: 1000,
    /** Caracteres do alvo em palavras. */
    alvo: 120,
    /** Registros que o documento diz ter. */
    linhas: 100_000,
} as const;

const ESCOPOS = ['seleção', 'com filtros', 'todos'] as const;

export const documentBodySchema = z.object({
    ids: z
        .array(z.string().trim().min(1, 'Id vazio').max(64, 'Id longo demais'))
        .min(1, 'Lista de ids vazia: mande os ids ou tire o campo.')
        .max(DOCUMENT_LIMITS.ids, `No máximo ${DOCUMENT_LIMITS.ids} ids por documento.`)
        .optional(),
    alvo: z
        .string()
        .trim()
        .max(DOCUMENT_LIMITS.alvo, `O alvo aceita até ${DOCUMENT_LIMITS.alvo} caracteres.`)
        .optional()
        .transform(v => v || undefined),
    linhas: z
        .number({ message: 'Informe o número de registros do documento (linhas).' })
        .int('O número de registros (linhas) é um inteiro.')
        .min(0, 'O número de registros (linhas) não pode ser negativo.')
        .max(DOCUMENT_LIMITS.linhas, `No máximo ${DOCUMENT_LIMITS.linhas} registros por documento.`),
    escopo: z.enum(ESCOPOS, { message: 'Escopo inválido: use seleção, com filtros ou todos.' }).optional(),
});

/** `AuditLog.details` de um documento: o formato da exportação, mais o tipo, o alvo e os ids. */
export type BrowserDocumentDetails = ExportAuditLogDetails & {
    documento: BrowserDocumentKind;
    alvo?: string;
    ids?: string[];
};

export type BrowserDocumentLog = {
    path: string;
    targetLabel: string;
    details: BrowserDocumentDetails;
};

const MAX_CITED = 5;

/** "CPF, RG, CNS, Nascimento, Nome da mãe e mais 1", como nas exportações. */
function cited(list: readonly string[]): string {
    const shown = list.slice(0, MAX_CITED);
    const rest = list.length - shown.length;
    return shown.join(', ') + (rest > 0 ? ` e mais ${rest}` : '');
}

export class LogBrowserDocumentUseCase {
    /**
     * O alvo ("Lista de presença: HORTA · 12 registros · com CPF") e os
     * detalhes da linha. Erro de corpo → 400.
     */
    execute(kind: BrowserDocumentKind, input: unknown): {
 error?: Error;
log?: BrowserDocumentLog 
} {
        if (!isBrowserDocumentKind(kind)) return { error: new ValidationError('Documento desconhecido.') };
        const doc = BROWSER_DOCUMENTS[kind];
        const parsed = documentBodySchema.safeParse(input ?? {});
        if (!parsed.success) return { error: new ValidationError(parsed.error.issues[0]?.message ?? 'Corpo inválido') };
        const { ids, alvo, linhas } = parsed.data;
        const escopo = parsed.data.escopo ?? (ids?.length ? 'seleção' : 'todos');

        const head = alvo ? `${doc.name}: ${alvo}` : doc.name;
        const count = `${linhas} registro${linhas === 1 ? '' : 's'}`;
        const targetLabel = [head, count, ...(doc.cita.length ? [`com ${cited(doc.cita)}`] : [])].join(' · ');

        return {
            log: {
                path: `${BROWSER_DOCUMENTS_PATH}${kind}`,
                targetLabel,
                details: {
                    formato: 'pdf',
                    modelo: doc.name,
                    campos: [],
                    escopo,
                    filtros: [],
                    linhas,
                    documento: kind,
                    ...(alvo && { alvo }),
                    ...(ids?.length && { ids }),
                },
            },
        };
    }
}
