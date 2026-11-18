import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { createReportTemplateAdapter } from '../../adapter/database/report-template-adapter.js';
import { EXPORT_DATASETS, datasetPermissions, type ExportDataset } from '../../usecase/export/datasets.js';
import { EXPORT_SOURCES, NO_BUILDER_MESSAGE } from '../../usecase/export/catalog/index.js';
import { EXPORT_LIMITS } from '../../usecase/export/engine.js';
import {
    ReportTemplatesUseCase, TEMPLATE_LIMITS, TEMPLATE_MESSAGES,
} from '../../usecase/export/report-templates.js';
import { VISAO_MESSAGES, VISAO_PERIODOS, sourceHasVisoes } from '../../usecase/export/visoes.js';
import { setAuditLabel } from '../audit-hooks.js';
import { errorToStatus } from '../lib/require-permission.js';
import { adminOf, requiresFrom } from '../lib/route-auth.js';
import { errorResponse } from '../lib/swagger-schemas.js';

// Modelos de relatório salvos pela equipe (decisão 006, fase 3, SR-114).
//
// O caminho fica fora de `/admin/export/`, como a decisão pede: lá o hook geral
// da auditoria não grava nada (`skipAudit`), e a exportação tem o limite próprio
// de 30 por minuto. Aqui criar, mudar e excluir entram na trilha pelo hook
// geral ("Criou o modelo de relatório …"), e o alvo vem de `setAuditLabel`.

const tags = ['Admin — Export'];
const str = { type: 'string' };
const nstr = { type: 'string',
nullable: true };
const builderDatasets = Object.keys(EXPORT_SOURCES).join(', ');
const VISOES_DATASETS = Object.entries(EXPORT_SOURCES).filter(([, s]) => sourceHasVisoes(s)).map(([d]) => d).join(', ');

const datasetProp = { type: 'string',
enum: Object.keys(EXPORT_DATASETS) };
const datasetParams = { type: 'object',
required: ['dataset'],
properties: { dataset: datasetProp } };
const idParams = { type: 'object',
required: ['dataset', 'id'],
properties: { dataset: datasetProp,
id: str } };

const adminRef = { type: 'object',
properties: { id: str,
username: nstr } };

const templateSchema = {
    type: 'object',
    properties: {
        id: str,
        dataset: str,
        name: str,
        // Só as chaves que ainda existem no catálogo, na ordem das colunas.
        fields: { type: 'array',
items: str },
        // Chaves gravadas que saíram do catálogo: o montador avisa.
        missingFields: { type: 'array',
items: str },
        // csv | pdf | xlsx; null = sem preferência.
        format: nstr,
        // Só em registrations ("Só confirmadas"); null nos outros.
        confirmed: { type: 'boolean',
nullable: true },
        // Visões da lista (decisão 007; só finance-transactions): os filtros que a visão liga. null = nenhum.
        filters: { type: 'object',
nullable: true,
additionalProperties: true },
        createdAt: { type: 'string',
format: 'date-time' },
        updatedAt: { type: 'string',
format: 'date-time' },
        createdBy: adminRef,
        updatedBy: { ...adminRef,
nullable: true },
    },
};

// Tipos frouxos de propósito, como na exportação: quem confere e responde com
// a mensagem em português é o use case.
const bodyProps = {
    name: { type: 'string',
description: `Nome do modelo, de 1 a ${TEMPLATE_LIMITS.name} caracteres (os espaços das pontas saem e os do meio se juntam). Único no conjunto entre os modelos ativos, sem diferenciar maiúsculas.` },
    fields: { type: 'array',
items: str,
description: `Chaves do catálogo do conjunto, na ordem das colunas: de 1 a ${EXPORT_LIMITS.fields}, sem repetir.` },
    format: { type: 'string',
nullable: true,
description: 'Formato preferido: `csv`, `pdf` ou `xlsx`; null (ou ausente ao criar) = sem preferência.' },
    confirmed: { type: 'boolean',
description: 'Só em `registrations`: o modelo liga "Só confirmadas" (ao criar, ausente = false). Ignorado nos outros conjuntos.' },
    // Sem tipo de propósito: quem confere e responde em português é o use case.
    filters: {
        description: `Só nos conjuntos com visões (decisão 007; hoje ${VISOES_DATASETS}): os filtros que a visão liga. Chaves: os filtros da lista menos from, to, search e ids, mais \`periodo\` (${VISAO_PERIODOS.join(', ')}). Valor null ou "" (e false nos de sim/não) não é guardado; sem nenhum ligado, fica null. Os valores passam pelo schema da lista. Até 2 KB. No PATCH, null tira os filtros. Nos outros conjuntos → 400 "${VISAO_MESSAGES.notSupported}" (null é ignorado). Erro → 400 "Filtro inválido na visão: <campo>." ou "${VISAO_MESSAGES.tooBig}".`,
    },
};

const errors = `- Conjunto sem montador (hoje só ${builderDatasets} têm) → 404 "${NO_BUILDER_MESSAGE}"; conjunto desconhecido → 400.
- Mesma permissão da exportação do conjunto (READ_USER em people, READ_COURSE em registrations…).
- Nos conjuntos com visões (${VISOES_DATASETS}), o modelo da equipe é a **visão da lista** (decisão 007): guarda também \`filters\`; os 409 de nome dizem "${TEMPLATE_MESSAGES.visaoNameTaken}" e "${TEMPLATE_MESSAGES.visaoFactoryName}" (os nomes e ids das visões de fábrica também contam); a auditoria diz "Criou a visão "Lançamentos: …"" (entidade "Visão da lista") e \`changes.filters\` traz os filtros em palavras.`;

type Params = { dataset: ExportDataset };
type IdParams = Params & { id: string };

export async function reportTemplateRouter(fastify: FastifyInstance, prisma: PrismaClient) {
    const templates = new ReportTemplatesUseCase(createReportTemplateAdapter(prisma));

    // Ver, usar, salvar, mudar e excluir: a permissão de exportar o conjunto (do
    // caminho). Os campos de permissão própria são conferidos no use case.
    const auth = requiresFrom(req => datasetPermissions((req.params as { dataset?: string }).dataset));

    const fail = (reply: FastifyReply, error: Error | undefined) =>
        reply.status(errorToStatus(error)).send({ error: error?.message });

    fastify.get('/admin/report-templates/:dataset', {
        config: { auth },
        schema: {
            tags,
            summary: 'Modelos de relatório da equipe de um conjunto',
            description: `Os modelos que a equipe salvou no montador de relatórios, pelo nome. São da equipe toda; os de fábrica continuam no catálogo (\`GET /admin/export/:dataset/catalog\`).

- \`fields\`: só as chaves que ainda existem no catálogo, na ordem das colunas. As que saíram vêm em \`missingFields\` (o montador avisa).
- Campo que quem lista não pode exportar vem na lista do mesmo jeito: o catálogo diz quais (\`allowed: false\`), e o montador os tira.
- Sempre 200, com lista vazia quando não há modelo.
${errors}`,
            params: datasetParams,
            response: {
                200: { type: 'array',
items: templateSchema },
                400: errorResponse,
                401: errorResponse,
                403: errorResponse,
                404: errorResponse,
            },
        },
    }, async (req: FastifyRequest<{ Params: Params }>, reply: FastifyReply) => {
        const r = await templates.list(req.params.dataset);
        if (r.error || !r.templates) return fail(reply, r.error);
        return reply.send(r.templates);
    });

    fastify.post('/admin/report-templates/:dataset', {
        config: { auth },
        schema: {
            tags,
            summary: 'Salvar um modelo de relatório da equipe',
            description: `Salva as colunas montadas no montador como um modelo da equipe toda → 201 com o modelo.

- \`name\` e \`fields\` são obrigatórios; \`format\` e \`confirmed\` (só em registrations), opcionais.
- Erros 400: "${TEMPLATE_MESSAGES.nameRequired}", "${TEMPLATE_MESSAGES.nameTooLong}", "${TEMPLATE_MESSAGES.fieldsRequired}", "No máximo 80 campos por relatório.", "Campo desconhecido: <chave>.", "Campo repetido: <rótulo>.", "Formato inválido: use csv, pdf ou xlsx.".
- Erro 403 por campo, como na exportação: "Sem permissão para exportar: RG, Endereço: Cidade.".
- Erros 409: "${TEMPLATE_MESSAGES.nameTaken}", "${TEMPLATE_MESSAGES.factoryName}", "${TEMPLATE_MESSAGES.tooMany}".
- Auditoria: "Criou o modelo de relatório "Pessoas: Nome e CPF"".
${errors}`,
            params: datasetParams,
            body: { type: 'object',
properties: bodyProps },
            response: {
                201: templateSchema,
                400: errorResponse,
                401: errorResponse,
                403: errorResponse,
                404: errorResponse,
                409: errorResponse,
            },
        },
    }, async (req: FastifyRequest<{ Params: Params }>, reply: FastifyReply) => {
        const r = await templates.create(req.params.dataset, req.body, adminOf(req));
        if (r.error || !r.template) return fail(reply, r.error);
        setAuditLabel(req, r.auditLabel ?? null);
        return reply.status(201).send(r.template);
    });

    fastify.patch('/admin/report-templates/:dataset/:id', {
        config: { auth },
        schema: {
            tags,
            summary: 'Renomear ou mudar um modelo de relatório da equipe',
            description: `Muda só o que vier (\`name\`, \`fields\`, \`format\`, \`confirmed\`) → 200 com o modelo. \`format: null\` tira a preferência.

- Quem não pode exportar algum campo do modelo como ele está não muda nem exclui o modelo → 403 "Este modelo tem campos que você não pode exportar: RG.". Os campos novos passam pela mesma conferência de salvar.
- Erros 400: os de salvar e "${TEMPLATE_MESSAGES.nothingToChange}" (corpo sem nada para mudar). 404 "${TEMPLATE_MESSAGES.notFound}" (inexistente, excluído ou de outro conjunto). 409: os de salvar, menos o limite de modelos.
- Auditoria: "Editou o modelo de relatório "Pessoas: Contato"", com o nome antigo quando muda ("Pessoas: Contato (antes Contatos)") e o que mudou em \`changes\`.
${errors}`,
            params: idParams,
            body: { type: 'object',
properties: bodyProps },
            response: {
                200: templateSchema,
                400: errorResponse,
                401: errorResponse,
                403: errorResponse,
                404: errorResponse,
                409: errorResponse,
            },
        },
    }, async (req: FastifyRequest<{ Params: IdParams }>, reply: FastifyReply) => {
        const r = await templates.update(req.params.dataset, req.params.id, req.body, adminOf(req));
        if (r.error || !r.template) return fail(reply, r.error);
        setAuditLabel(req, r.auditLabel ?? null);
        return reply.send(r.template);
    });

    fastify.delete('/admin/report-templates/:dataset/:id', {
        config: { auth },
        schema: {
            tags,
            summary: 'Excluir um modelo de relatório da equipe',
            description: `Exclusão lógica → 204: o modelo sai da lista e o nome fica livre de novo.

- Quem não pode exportar algum campo do modelo não o exclui → 403 "Este modelo tem campos que você não pode exportar: RG.".
- 404 "${TEMPLATE_MESSAGES.notFound}" (inexistente, já excluído ou de outro conjunto).
- Auditoria: "Excluiu o modelo de relatório "Pessoas: Nome e CPF"", com o que o modelo tinha em \`changes\`.
${errors}`,
            params: idParams,
            response: {
                204: { description: 'Excluído.',
type: 'null' },
                400: errorResponse,
                401: errorResponse,
                403: errorResponse,
                404: errorResponse,
            },
        },
    }, async (req: FastifyRequest<{ Params: IdParams }>, reply: FastifyReply) => {
        const r = await templates.remove(req.params.dataset, req.params.id, adminOf(req));
        if (r.error) return fail(reply, r.error);
        setAuditLabel(req, r.auditLabel ?? null);
        return reply.status(204).send();
    });
}
