// "O que mudou" numa edição/exclusão, para a trilha de auditoria. Recebe o
// registro lido antes e depois da ação e guarda só os campos alterados como
// [{ field, before, after }]. Segredos, binários e colunas internas nunca saem daqui.

export type AuditValue = string | number | boolean | null;

export type AuditChange = {
    field: string;
    before: AuditValue;
    after: AuditValue;
};

export const AUDIT_TEXT_MAX = 300;
/** Limite de campos por linha (a trilha não é backup do registro). */
export const AUDIT_CHANGES_MAX = 40;
const REMOVED_FIELDS_MAX = 20;

// Nunca guardados, nem mascarados.
const HIDDEN = new Set(['id', 'token', 'storageKey', 'createdAt', 'updatedAt', 'deletedAt', 'isDeleted', 'createdBy']);
// Segredos: só registra que mudou, sem valor nenhum.
const SECRET = new Set(['passwordHash', 'password']);

function isHidden(key: string): boolean {
    return HIDDEN.has(key) || key.endsWith('Search');
}

function isBinary(value: unknown): boolean {
    return value instanceof Uint8Array || value instanceof ArrayBuffer;
}

function truncate(text: string): string {
    return text.length > AUDIT_TEXT_MAX ? `${text.slice(0, AUDIT_TEXT_MAX - 1)}…` : text;
}

/** Valor comparável/gravável, SEM cortar (o corte vem depois da comparação). */
function normalize(value: unknown): AuditValue | undefined {
    if (value === null || value === undefined) return null;
    if (isBinary(value)) return undefined;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
    if (typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'bigint') return value.toString();
    if (Array.isArray(value) && value.every(v => v === null || ['string', 'number', 'boolean'].includes(typeof v))) {
        return value.join(', ');
    }
    // Decimal do Prisma e afins: têm toString próprio.
    if (typeof value === 'object' && value.constructor && value.constructor !== Object && !Array.isArray(value)) {
        const text = String(value);
        if (text !== '[object Object]') return text;
    }
    try {
        return JSON.stringify(value) ?? null;
    } catch {
        return null;
    }
}

const store = (value: AuditValue): AuditValue => (typeof value === 'string' ? truncate(value) : value);

/** Campos gravados do registro (sem segredos, binários e colunas internas). Valores já cortados. */
export function sanitizeSnapshot(record: Record<string, unknown> | null | undefined): Record<string, AuditValue> | null {
    if (!record || typeof record !== 'object') return null;
    const out: Record<string, AuditValue> = {};
    for (const [key, raw] of Object.entries(record)) {
        if (isHidden(key) || SECRET.has(key)) continue;
        const value = normalize(raw);
        if (value === undefined) continue;
        out[key] = store(value);
    }
    return out;
}

function comparable(record: Record<string, unknown>): Map<string, AuditValue> {
    const map = new Map<string, AuditValue>();
    for (const [key, raw] of Object.entries(record)) {
        if (isHidden(key) || SECRET.has(key)) continue;
        const value = normalize(raw);
        if (value !== undefined) map.set(key, value);
    }
    return map;
}

/**
 * Campos que mudaram entre as duas leituras. Senha alterada vira
 * `{ field: 'password', before: null, after: 'alterada' }` (nunca o hash).
 * Sem mudança (ou sem uma das leituras) → null.
 */
export function diffSnapshots(
    before: Record<string, unknown> | null | undefined,
    after: Record<string, unknown> | null | undefined,
): AuditChange[] | null {
    if (!before || !after) return null;
    const changes: AuditChange[] = [];
    for (const key of SECRET) {
        if (key in before && key in after && before[key] !== after[key]) {
            changes.push({ field: 'password',
before: null,
after: 'alterada' });
            break;
        }
    }
    const a = comparable(before);
    const b = comparable(after);
    const keys = [...new Set([...a.keys(), ...b.keys()])];
    for (const key of keys) {
        const prev = a.get(key) ?? null;
        const next = b.get(key) ?? null;
        if (prev === next) continue;
        changes.push({ field: key,
before: store(prev),
after: store(next) });
        if (changes.length >= AUDIT_CHANGES_MAX) break;
    }
    return changes.length ? changes : null;
}

/** Exclusão: os campos preenchidos do registro removido (antes), depois = null. */
export function removedSnapshot(before: Record<string, unknown> | null | undefined): AuditChange[] | null {
    const clean = sanitizeSnapshot(before);
    if (!clean) return null;
    const changes: AuditChange[] = [];
    for (const [field, value] of Object.entries(clean)) {
        // ids de relação não dizem nada a quem lê; os nomes vêm em campos próprios.
        if (value === null || value === '' || field.endsWith('Id')) continue;
        changes.push({ field,
before: value,
after: null });
        if (changes.length >= REMOVED_FIELDS_MAX) break;
    }
    return changes.length ? changes : null;
}

// Nome dos campos mais comuns na planilha (o painel tem a mesma lista); os demais saem como estão.
export const AUDIT_FIELD_LABELS: Record<string, string> = {
    name: 'Nome',
    tradeName: 'Nome fantasia',
    email: 'E-mail',
    phone: 'Telefone',
    cpf: 'CPF',
    cnpj: 'CNPJ',
    status: 'Situação',
    title: 'Título',
    subtitle: 'Subtítulo',
    description: 'Descrição',
    price: 'Preço',
    priceCents: 'Preço',
    amountCents: 'Valor',
    startTime: 'Início',
    endTime: 'Término',
    permissions: 'Permissões',
    username: 'Usuário',
    password: 'Senha',
    rule: 'Regra',
    person: 'Pessoa',
    course: 'Curso',
    room: 'Sala',
    address: 'Endereço',
    confirmed: 'Confirmada',
    attended: 'Presença',
    active: 'Ativo',
    isActive: 'Ativo',
    read: 'Lida',
    order: 'Ordem',
    unit: 'Unidade',
    date: 'Data',
    category: 'Categoria',
    account: 'Caixa',
    notes: 'Observações',
};

const show = (value: unknown): string => (value === null || value === undefined || value === '' ? '(vazio)' : String(value));

/** Para a planilha: "Campo: antes → depois; …". */
export function formatChanges(changes: unknown): string {
    if (!Array.isArray(changes)) return '';
    return changes
        .filter((c): c is AuditChange => !!c && typeof c === 'object' && typeof (c as AuditChange).field === 'string')
        .map(c => `${AUDIT_FIELD_LABELS[c.field] ?? c.field}: ${show(c.before)} → ${show(c.after)}`)
        .join('; ');
}
