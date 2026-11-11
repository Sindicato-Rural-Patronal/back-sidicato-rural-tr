import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { Permission } from '../../generated/prisma/enums.js';
import { AUDIT_EXPORT_LIMIT, createExportAdapter } from '../../adapter/database/export-adapter.js';
import { EXPORT_DATASETS, ExportDataUseCase, type ExportDataset } from '../../usecase/export-data.js';
import { GetExportCatalogUseCase } from '../../usecase/export/get-export-catalog.js';
import { EXPORT_SOURCES, NO_BUILDER_MESSAGE } from '../../usecase/export/catalog/index.js';
import { EXPORT_LIMITS } from '../../usecase/export/engine.js';
import { errorToStatus } from '../lib/require-permission.js';
import { adminOf, requiresFrom } from '../lib/route-auth.js';
import { errorResponse } from '../lib/swagger-schemas.js';
import { EXPORT_RATE_LIMIT, EXPORT_RATE_LIMIT_MESSAGE, exportRateLimit, replyWithExport } from '../lib/export-reply.js';

const builderDatasets = Object.keys(EXPORT_SOURCES).join(', ');

// Parâmetros do montador (decisão 006, item 3). Os tipos aqui são frouxos de
// propósito: quem confere e responde com a mensagem em português é o use case.
const builderParams = {
    fields: {
        type: ['array', 'string'],
        items: { type: 'string' },
        description: `Chaves do catálogo, na ordem das colunas (GET: "a,b,c"). De 1 a ${EXPORT_LIMITS.fields}, sem repetir. Ausente = o padrão de hoje. Só em: ${builderDatasets}.`,
    },
    format: { type: 'string',
description: '`csv` (padrão) ou `pdf` (devolve o JSON para o painel desenhar o PDF). PDF só nos conjuntos com montador.' },
    modelo: { type: 'string',
description: 'Id ou nome do modelo usado (até 64). Só vai para a auditoria e o cabeçalho do PDF.' },
    confirmed: { type: 'boolean',
description: 'Só em `registrations`: true = só as inscrições confirmadas.' },
};

const pdfResponse = {
    type: 'object',
    properties: {
        title: { type: 'string' },
        filename: { type: 'string' },
        count: { type: 'integer' },
        // Filtros em palavras ("Busca: silva · Só associados em dia"); "" sem filtro.
        filters: { type: 'string' },
        modelo: { type: 'string',
nullable: true },
        columns: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    key: { type: 'string' },
                    label: { type: 'string' },
                    type: { type: 'string' },
                    // Largura relativa da coluna.
                    weight: { type: 'number' },
                },
            },
        },
        // Células já formatadas como no CSV, sem o apóstrofo contra fórmula.
        rows: { type: 'array',
items: { type: 'array',
items: { type: 'string' } } },
    },
};

const catalogResponse = {
    type: 'object',
    properties: {
        dataset: { type: 'string' },
        title: { type: 'string' },
        groups: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    name: { type: 'string' },
                    fields: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                key: { type: 'string' },
                                label: { type: 'string' },
                                type: { type: 'string' },
                                // comum | pessoal | sensivel
                                privacy: { type: 'string' },
                                allowed: { type: 'boolean' },
                                // Por que está desligado; null quando pode.
                                reason: { type: 'string',
nullable: true },
                            },
                        },
                    },
                },
            },
        },
        padrao: { type: 'array',
items: { type: 'string' } },
        modelos: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    id: { type: 'string' },
                    name: { type: 'string' },
                    fields: { type: 'array',
items: { type: 'string' } },
                    // Só no modelo que liga "Só confirmadas" (Lista de presença das inscrições).
                    confirmed: { type: 'boolean' },
                },
            },
        },
        filterLabels: { type: 'object',
additionalProperties: { type: 'string' } },
        limits: {
            type: 'object',
            properties: {
                rows: { type: 'integer' },
                pdfRows: { type: 'integer' },
                fields: { type: 'integer' },
            },
        },
    },
};

export async function exportRouter(fastify: FastifyInstance, prisma: PrismaClient) {
    const repo = createExportAdapter(prisma);
    const exportData = new ExportDataUseCase(repo);
    const getCatalog = new GetExportCatalogUseCase();

    const description = `Exporta um conjunto de dados: planilha CSV (\`;\`, UTF-8 com BOM) ou, nos conjuntos com montador de relatórios, o JSON do PDF.

- \`ids\`: só esses registros (seleção na lista ou um registro só). Lista vazia → 400.
- Sem \`ids\`: tudo o que bate com os mesmos filtros da listagem.
- **POST** recebe os parâmetros no corpo JSON (listas como array) — use para seleções grandes. **GET** aceita os mesmos na query (listas "a,b,c").

**Montador de relatórios** (decisão 006; hoje em ${builderDatasets}; o catálogo está em \`GET /admin/export/:dataset/catalog\`):
- \`fields\`: chaves do catálogo na ordem das colunas. **Sem \`fields\` sai exatamente o CSV de hoje** (o modelo padrão). Com \`fields\`, telefone e CNS saem com máscara.
- \`format\`: \`csv\` ou \`pdf\` (JSON \`{ title, filename, count, filters, modelo, columns, rows }\`).
- \`modelo\`: id ou nome do modelo (só para a auditoria e o PDF). \`confirmed\` (inscrições): só as confirmadas.
- Limites: ${EXPORT_LIMITS.rows} linhas, ${EXPORT_LIMITS.pdfRows} no PDF, ${EXPORT_LIMITS.fields} campos.
- Erros 400: "Escolha pelo menos um campo.", "Campo desconhecido: <chave>.", "Campo repetido: <rótulo>.", "No máximo 80 campos por relatório.", "Formato inválido: use csv ou pdf.", "O relatório passa de 20.000 linhas. Use um filtro para diminuir.", "O PDF aceita até 2.000 linhas. Baixe a planilha ou use um filtro.", "${NO_BUILDER_MESSAGE}" (fields ou PDF num conjunto sem montador).
- Erro 403 por campo: "Sem permissão para exportar: RG, Endereço: Rua." (em \`registrations\` e \`admins\`, os campos da pessoa além dos que já saíam pedem também READ_USER; o catálogo os mostra com \`allowed: false\`).
- ${EXPORT_RATE_LIMIT} exportações por minuto por IP → 429 "${EXPORT_RATE_LIMIT_MESSAGE}".

| dataset | filtros | permissão |
|---|---|---|
| people | search, memberType, memberClassification, gender, ethnicity, educationLevel, incompleteRegistration, activeMember | READ_USER |
| cadastros | (nenhum — retrato completo dos 4 tipos num arquivo só) | READ_USER_ADMIN + READ_USER |
| companies | search, type, isPartner | READ_USER |
| properties | ownerIds (pessoas/empresas) | READ_USER |
| admins | search, rulesId | READ_USER_ADMIN |
| courses | search, status, view (upcoming = Próximos, stored = Armazenados), year (1990–2100): os mesmos da lista de cursos | READ_COURSE |
| registrations | courseIds, confirmed | READ_COURSE |
| contact-messages | search, read | READ_CONTACT |
| unimed | search | READ_USER |
| room-bookings | from, to (AAAA-MM-DD), roomId, type (EVENT, MEETING), search | READ_COURSE |
| audit-logs | action (create, edit, delete, export, login, login_failed), entity, actorId, ip, from, to (AAAA-MM-DD, dia em Brasília), q — no máximo ${AUDIT_EXPORT_LIMIT} linhas mais recentes; sem ids | READ_AUDIT |
| finance-transactions | from, to (AAAA-MM-DD; to inclui o dia inteiro), type (IN, OUT), categoryId, accountId, method, search, orderBy (date, number): os da lista de lançamentos; sem ids. Filtro inválido → 400 "Parâmetro inválido: <campo>" | READ_FINANCE |

Cada exportação fica registrada na auditoria (ação "Exportou"), com o formato e os campos pessoais no alvo.`;

    const datasetParams = {
        type: 'object',
        required: ['dataset'],
        properties: { dataset: { type: 'string',
enum: Object.keys(EXPORT_DATASETS) } },
    };

    const schema = (method: 'GET' | 'POST') => ({
        tags: ['Admin — Export'],
        summary: `Exportar dados em CSV ou montar relatório (${method})`,
        description,
        params: datasetParams,
        ...(method === 'GET'
            ? { querystring: { type: 'object',
additionalProperties: true,
properties: builderParams } }
            : { body: { type: 'object',
additionalProperties: true,
properties: builderParams } }),
        response: {
            200: {
                description: 'CSV (`text/csv`) ou, com `format=pdf`, o JSON do PDF.',
                content: {
                    'text/csv': { schema: { type: 'string' } },
                    'application/json': { schema: pdfResponse },
                },
            },
            400: errorResponse,
            401: errorResponse,
            403: errorResponse,
            429: errorResponse,
        },
    });

    // A permissão depende do conjunto (do caminho): `cadastros` pede duas.
    // Conjunto inexistente → só o login, e a validação do schema responde 400.
    const auth = requiresFrom(req => {
        const spec: {
 permission: Permission;
alsoRequires?: Permission
} | undefined =
            EXPORT_DATASETS[(req.params as { dataset: string }).dataset as ExportDataset];
        if (!spec) return null;
        return spec.alsoRequires ? [spec.permission, spec.alsoRequires] : [spec.permission];
    });

    function handle(req: FastifyRequest<{ Params: { dataset: ExportDataset } }>, reply: FastifyReply, input: unknown) {
        return replyWithExport(req, reply, { exportData,
repo,
dataset: req.params.dataset,
input });
    }

    fastify.get(
        '/admin/export/:dataset',
        { config: { auth,
...exportRateLimit },
schema: schema('GET') },
        (req: FastifyRequest<{ Params: { dataset: ExportDataset } }>, reply: FastifyReply) => handle(req, reply, req.query),
    );
    fastify.post(
        '/admin/export/:dataset',
        { config: { auth,
...exportRateLimit },
schema: schema('POST') },
        (req: FastifyRequest<{ Params: { dataset: ExportDataset } }>, reply: FastifyReply) => handle(req, reply, req.body ?? {}),
    );

    fastify.get(
        '/admin/export/:dataset/catalog',
        {
            config: { auth },
            schema: {
                tags: ['Admin — Export'],
                summary: 'Catálogo do montador de relatórios de um conjunto',
                description: `Os campos que dá para escolher (agrupados, na ordem do montador), o padrão de hoje, os modelos de fábrica, os nomes dos filtros e os limites.

- O campo sem permissão vem com \`allowed: false\` e o motivo em \`reason\` ("Pede a permissão Visualizar usuários"): o montador mostra desligado.
- Conjunto sem montador (hoje só ${builderDatasets} têm) → 404 "${NO_BUILDER_MESSAGE}".
- Mesma permissão da exportação do conjunto.`,
                params: datasetParams,
                response: {
                    200: catalogResponse,
                    400: errorResponse,
                    401: errorResponse,
                    403: errorResponse,
                    404: errorResponse,
                },
            },
        },
        (req: FastifyRequest<{ Params: { dataset: ExportDataset } }>, reply: FastifyReply) => {
            const r = getCatalog.execute(req.params.dataset, adminOf(req));
            if (r.error || !r.catalog) return reply.status(errorToStatus(r.error)).send({ error: r.error?.message });
            return reply.send(r.catalog);
        },
    );
}
