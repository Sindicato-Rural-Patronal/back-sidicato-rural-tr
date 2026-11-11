import { z } from 'zod';
import type { AuditLogExportRow, ExportRepository } from '../../../ports/external/export-repository.js';
import { describeAuditAction } from '../../../lib/audit-sentence.js';
import { formatChanges } from '../../../lib/audit-diff.js';
import { describeUserAgent } from '../../../lib/user-agent.js';
import { day, describePeriod, empty, text } from '../filters.js';
import { reportFields } from './person-fields.js';
import type { ExportField, ExportFilterDescription, ExportSource } from './types.js';

// Fonte `audit-logs`: a trilha de auditoria (permissão READ_AUDIT). Pessoais
// são o IP, o local e o aparelho de quem usou o painel (decisão 006,
// inventário, item 13).
//
// A exportação corta nas 20.000 linhas mais recentes, como sempre cortou: o
// adapter lê no máximo isso, então a auditoria nunca cai no "passa de 20.000
// linhas" do motor. O PDF continua com o limite de 2.000.
//
// AS CHAVES SÃO CONTRATO: não se renomeia nem se reaproveita uma chave.

const ACTIONS = ['create', 'edit', 'delete', 'export', 'login', 'login_failed'] as const;

const filters = z.object({
    action: z.preprocess(empty, z.enum(ACTIONS).optional()),
    entity: text,
    actorId: text,
    ip: text,
    from: day,
    to: day,
    q: text,
});

// A trilha não tem seleção: exporta sempre pelos filtros da tela.
type AuditFilters = z.infer<typeof filters> & { ids?: never };

const filterLabels = {
    action: 'Ação',
    entity: 'Área',
    actorId: 'Quem',
    ip: 'IP',
    from: 'De',
    to: 'Até',
    q: 'Busca',
};

/** Os nomes do filtro "Ação" na tela da Auditoria. */
const ACTION_LABEL: Record<(typeof ACTIONS)[number], string> = {
    create: 'Criações',
    edit: 'Edições',
    delete: 'Exclusões',
    export: 'Exportações',
    login: 'Logins',
    login_failed: 'Falhas de login',
};

type Details = {
    formato?: unknown;
    modelo?: unknown;
    campos?: unknown;
    escopo?: unknown;
    filtros?: unknown;
    linhas?: unknown;
};

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : []);

/**
 * "O que foi exportado" (`AuditLog.details`) numa célula: "Formato: PDF;
 * Modelo: Nome e CPF; Campos: Nome, CPF; Escopo: com filtros; Filtros: Busca:
 * silva, Só associados em dia; Linhas: 3". Linha sem detalhes → null.
 */
export function describeExportDetails(details: unknown): string | null {
    if (!details || typeof details !== 'object' || Array.isArray(details)) return null;
    const d = details as Details;
    if (typeof d.formato !== 'string') return null;
    const filtros = Array.isArray(d.filtros)
        ? d.filtros
            .filter((f): f is {
 nome: string;
valor: string 
} =>
                !!f && typeof f === 'object' && typeof f.nome === 'string' && typeof f.valor === 'string')
            .map(f => (f.valor === 'Sim' ? f.nome : `${f.nome}: ${f.valor}`))
        : [];
    const campos = strings(d.campos);
    const parts = [`Formato: ${d.formato.toUpperCase()}`];
    if (typeof d.modelo === 'string' && d.modelo) parts.push(`Modelo: ${d.modelo}`);
    if (campos.length) parts.push(`Campos: ${campos.join(', ')}`);
    if (typeof d.escopo === 'string' && d.escopo) parts.push(`Escopo: ${d.escopo}`);
    if (filtros.length) parts.push(`Filtros: ${filtros.join(', ')}`);
    if (typeof d.linhas === 'number') parts.push(`Linhas: ${d.linhas}`);
    return parts.join('; ');
}

const auditFields: ExportField<AuditLogExportRow>[] = [
    // Registro
    { key: 'createdAt',
label: 'Data e hora',
group: 'Registro',
type: 'datetime',
privacy: 'comum',
value: a => a.createdAt },
    { key: 'actor',
label: 'Quem',
group: 'Registro',
type: 'text',
privacy: 'comum',
value: a => a.actorName },
    // A mesma frase da tela da Auditoria, sem o nome (que vai em "Alvo").
    {
        key: 'action',
        label: 'Ação',
        group: 'Registro',
        type: 'text',
        privacy: 'comum',
        weight: 3,
        value: a => describeAuditAction({ ...a,
targetLabel: null }),
    },
    { key: 'entity',
label: 'Área',
group: 'Registro',
type: 'text',
privacy: 'comum',
value: a => a.entity },
    { key: 'target',
label: 'Alvo',
group: 'Registro',
type: 'text',
privacy: 'comum',
weight: 4,
value: a => a.targetLabel },
    { key: 'path',
label: 'Caminho',
group: 'Registro',
type: 'text',
privacy: 'comum',
weight: 3,
value: a => a.path },

    // De onde veio
    { key: 'ip',
label: 'IP',
group: 'De onde veio',
type: 'text',
privacy: 'pessoal',
value: a => a.ip },
    { key: 'location',
label: 'Local',
group: 'De onde veio',
type: 'text',
privacy: 'pessoal',
value: a => a.location },
    {
        key: 'device',
        label: 'Aparelho',
        group: 'De onde veio',
        type: 'text',
        privacy: 'pessoal',
        value: a => (a.userAgent ? describeUserAgent(a.userAgent) : null),
    },

    // Detalhes
    // "campo: antes → depois; …"
    { key: 'changes',
label: 'Alterações',
group: 'Detalhes',
type: 'text',
privacy: 'comum',
weight: 5,
value: a => formatChanges(a.changes) },
    // Campo novo da decisão 006, fora do padrão: o padrão continua com as 10 de sempre.
    {
        key: 'exportDetails',
        label: 'Detalhes da exportação',
        group: 'Detalhes',
        type: 'text',
        privacy: 'comum',
        weight: 5,
        value: a => describeExportDetails(a.details),
    },
];

/** As 10 colunas de hoje, na ordem de hoje. Congeladas pelo teste de ouro. */
const PADRAO = ['createdAt', 'actor', 'action', 'entity', 'target', 'path', 'ip', 'location', 'device', 'changes'];

/**
 * "Ação: Exportações · Área: Usuário · Quem: bali · IP: … · Período: 01/01/2026
 * a 31/01/2026 · Busca: joão". Quem vem pelo usuário das linhas (filtradas por
 * ele, todas têm o mesmo); sem nenhuma linha, pelo id.
 */
async function describeFilters(f: AuditFilters, rows: AuditLogExportRow[], repo: ExportRepository): Promise<ExportFilterDescription[]> {
    const out: ExportFilterDescription[] = [];
    if (f.action) out.push({ nome: filterLabels.action,
valor: ACTION_LABEL[f.action] });
    if (f.entity) out.push({ nome: filterLabels.entity,
valor: f.entity });
    if (f.actorId) {
        const name = rows[0]?.actorName ?? (await repo.adminUsername(f.actorId));
        out.push({ nome: filterLabels.actorId,
valor: name ?? f.actorId });
    }
    if (f.ip) out.push({ nome: filterLabels.ip,
valor: f.ip });
    out.push(...describePeriod(f.from, f.to));
    if (f.q) out.push({ nome: filterLabels.q,
valor: f.q });
    return out;
}

export const auditLogsSource: ExportSource<AuditLogExportRow, AuditFilters> = {
    dataset: 'audit-logs',
    filters,
    filterLabels,
    describeFilters,
    fields: [...auditFields, ...reportFields<AuditLogExportRow>()],
    padrao: PADRAO,
    modelos: [{ id: 'resumida',
name: 'Resumida',
fields: ['createdAt', 'actor', 'action', 'target'] }],
    // Sem `take`: o adapter corta nas 20.000 mais recentes (ver o topo).
    query: (repo, f) => repo.auditLogs(f),
    // A trilha não tem "um registro só" pelo nome.
    firstName: () => undefined,
};
