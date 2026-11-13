import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ExportRepository } from '../../ports/external/export-repository.js';
import type { ExportDataUseCase, ExportDataset } from '../../usecase/export-data.js';
import { requestContext } from '../../lib/request-context.js';
import { XLSX_CONTENT_TYPE } from '../../lib/xlsx.js';
import { fillAuditLocationLater } from '../audit-hooks.js';
import { errorToStatus } from './require-permission.js';
import { adminOf } from './route-auth.js';

// Resposta de uma exportação (decisão 006): roda o motor, grava a linha EXPORT
// na auditoria e devolve o CSV, o .xlsx ou o JSON do PDF. Usada por
// `/admin/export/:dataset`. A rota antiga do CSV do Financeiro
// (`GET /admin/finance/transactions/export`) também passava por aqui; foi
// apagada na SR-119, e o CSV sai por `/admin/export/finance-transactions`.

/** Exportações por minuto por IP (decisão 006, item 7.4): uma conta invadida não baixa tudo em laço. */
export const EXPORT_RATE_LIMIT = 30;
export const EXPORT_RATE_LIMIT_MESSAGE = 'Muitas exportações seguidas. Aguarde um minuto e tente de novo.';

function tooManyExports(_req: FastifyRequest, context: { statusCode: number }) {
    const err = new Error(EXPORT_RATE_LIMIT_MESSAGE) as Error & { statusCode: number };
    err.statusCode = context.statusCode;
    return err;
}

/** O `config` de limite da rota: 30 por minuto por IP, cada rota contando separado. */
export const exportRateLimit = {
    rateLimit: { max: EXPORT_RATE_LIMIT,
timeWindow: '1 minute',
errorResponseBuilder: tooManyExports },
};

/** Documentos do navegador avisados por minuto por IP (SR-104): para não encher a auditoria. */
export const DOCUMENT_RATE_LIMIT = 30;
export const DOCUMENT_RATE_LIMIT_MESSAGE = 'Muitos documentos seguidos. Aguarde um minuto e tente de novo.';

export const documentRateLimit = {
    rateLimit: {
        max: DOCUMENT_RATE_LIMIT,
        timeWindow: '1 minute',
        errorResponseBuilder: (_req: FastifyRequest, context: { statusCode: number }) => {
            const err = new Error(DOCUMENT_RATE_LIMIT_MESSAGE) as Error & { statusCode: number };
            err.statusCode = context.statusCode;
            return err;
        },
    },
};

export async function replyWithExport(
    req: FastifyRequest,
    reply: FastifyReply,
    opts: {
        exportData: ExportDataUseCase;
        repo: ExportRepository;
        dataset: ExportDataset;
        input: unknown;
    },
) {
    const admin = adminOf(req);

    const r = await opts.exportData.execute(opts.dataset, opts.input, admin);
    if (r.error || !r.result) return reply.status(errorToStatus(r.error)).send({ error: r.error?.message });

    try {
        const logged = await opts.repo.logExport({
            actorId: admin.id,
            path: `/admin/export/${opts.dataset}`,
            targetLabel: r.result.auditLabel,
            details: r.result.auditDetails,
            ...requestContext(req),
        });
        fillAuditLocationLater(req, logged.id);
    } catch {
        /* auditoria nunca deve derrubar a exportação */
    }

    reply
        .header('X-Export-Count', String(r.result.count))
        .header('Access-Control-Expose-Headers', 'Content-Disposition, X-Export-Count');
    if (r.result.pdf) return reply.send(r.result.pdf);
    if (r.result.xlsx) {
        return reply
            .header('Content-Type', XLSX_CONTENT_TYPE)
            .header('Content-Disposition', `attachment; filename="${r.result.filename}"`)
            .send(r.result.xlsx);
    }
    return reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="${r.result.filename}"`)
        .send(r.result.csv);
}
