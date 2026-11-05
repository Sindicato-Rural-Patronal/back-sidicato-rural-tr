import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { semRegistro } from './prisma-errors.js';
import { docDigitsOf, searchKey } from './list-filters.js';
import { uniqueViolationTarget } from '../../lib/prisma-errors.js';
import {
    financeNumberSearchTerm,
    nextFinanceNumber,
    pickFinanceNumber,
    type FinanceNumberReader,
} from '../../lib/finance-number.js';
import type { FinancialCategoryModel } from '../../generated/prisma/models/FinancialCategory.js';
import type { FinancialTransactionModel } from '../../generated/prisma/models/FinancialTransaction.js';
import type {
    FinancialTransactionOrderByWithRelationInput,
    FinancialTransactionUncheckedCreateInput,
    FinancialTransactionUncheckedUpdateInput,
} from '../../generated/prisma/models/FinancialTransaction.js';
import type { FinancialAccountModel } from '../../generated/prisma/models/FinancialAccount.js';
import type { FinanceRecurringTransactionModel } from '../../generated/prisma/models/FinanceRecurringTransaction.js';
import type { FinancePaymentMethodModel } from '../../generated/prisma/models/FinancePaymentMethod.js';
import type { FinanceMonthlyClosingModel } from '../../generated/prisma/models/FinanceMonthlyClosing.js';
import type {
    FinanceRepository,
    FinanceRecurrenceCreateInput,
    FinanceRecurrenceUpdateInput,
    FinanceRecurrenceWithRefs,
    FinanceRecurrenceRun,
    FinancePaymentMethodCreateInput,
    FinancePaymentMethodUpdateInput,
    FinanceAccountMonthMovement,
    FinanceAccountMonth,
    FinanceClosedMonth,
    FinanceClosingCreateInput,
    FinancialType,
    FinanceCategoryCreateInput,
    FinanceCategoryUpdateInput,
    FinanceAccountCreateInput,
    FinanceAccountUpdateInput,
    FinanceTransactionCreateInput,
    FinanceTransactionUpdateInput,
    FinanceNumberedWrite,
    FinanceNumberConflict,
    FinanceTransferInput,
    FinanceTransactionFilters,
    FinanceTransactionSum,
    FinanceTransactionWithCategory,
    FinanceAttachmentMeta,
    FinanceAttachmentFile,
    FinanceSummary,
} from '../../ports/external/finance-repository.js';

// Só metadados do comprovante — nunca os bytes (`data`) na listagem.
const attachmentMetaSelect = {
    select: { id: true,
filename: true,
mimeType: true,
size: true,
createdAt: true },
} as const;

export function createFinanceAdapter(prisma: PrismaClient): FinanceRepository {
    return new FinanceAdapter(prisma);
}

/**
 * Trava do Nº dos lançamentos (decisão 005, item 3). Toda gravação que dá ou
 * troca o número (criar, transferir, gerar recorrência e corrigir o Nº) pega
 * esta trava ANTES de ler o maior, em READ COMMITTED, e a solta no fim da
 * transação: dois lançamentos gravados ao mesmo tempo nunca levam o mesmo
 * número, e o "maior + 1" nunca pula. Mesmo padrão das vagas de curso
 * (`lockCourseSeats`) e das salas (`lockRoom`). O volume do Financeiro é de
 * poucos lançamentos por dia: a fila nesta trava não se percebe.
 */
export async function lockFinanceNumbers(tx: PrismaClient): Promise<void> {
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext('finance-transaction-number'))`;
}

/** O que a regra do Nº lê, dentro da transação travada. Conta os excluídos. */
function numberReader(tx: PrismaClient): FinanceNumberReader {
    return {
        maxNumber: async () => (await tx.financialTransaction.aggregate({ _max: { number: true } }))._max.number,
        ownerOf: number => tx.financialTransaction.findUnique({
            where: { number },
            select: { id: true,
isDeleted: true },
        }),
    };
}

// Nomes dos índices únicos do lançamento, como o adapter-pg os devolve no P2002.
const NUMBER_KEY = 'FinancialTransaction_number_key';
const RECURRENCE_MONTH_KEY = 'FinancialTransaction_recurringId_recurringMonth_key';

/** O P2002 foi no Nº (a defesa final: o índice único)? */
function isNumberTaken(e: unknown): boolean {
    const target = uniqueViolationTarget(e);
    return target.includes(NUMBER_KEY) || target.includes('number');
}

/** O P2002 foi no par (recorrência, mês)? Só isso quer dizer "este mês já foi gerado". */
function isRecurrenceMonthTaken(e: unknown): boolean {
    const target = uniqueViolationTarget(e);
    return target.includes(RECURRENCE_MONTH_KEY)
        || (target.includes('recurringId') && target.includes('recurringMonth'));
}

/** Ordem da lista e do CSV: data (padrão) ou Nº, do mais novo para o mais antigo. */
function transactionOrder(orderBy: FinanceTransactionFilters['orderBy']): FinancialTransactionOrderByWithRelationInput[] {
    if (orderBy === 'number') return [{ number: { sort: 'desc',
nulls: 'last' } }, { createdAt: 'desc' }];
    return [{ date: 'desc' }, { createdAt: 'desc' }];
}

class FinanceAdapter implements FinanceRepository {
    constructor(private prisma: PrismaClient) {}

    // ── Categorias ──────────────────────────────────────────────────────────
    listCategories(includeInactive: boolean): Promise<FinancialCategoryModel[]> {
        return this.prisma.financialCategory.findMany({
            where: { isDeleted: false,
...(includeInactive ? {} : { active: true }) },
            orderBy: [{ order: 'asc' }, { name: 'asc' }],
        });
    }

    findCategoryById(id: string): Promise<FinancialCategoryModel | null> {
        return this.prisma.financialCategory.findFirst({ where: { id,
isDeleted: false } });
    }

    createCategory(data: FinanceCategoryCreateInput): Promise<FinancialCategoryModel> {
        return this.prisma.financialCategory.create({ data });
    }

    updateCategory(id: string, data: FinanceCategoryUpdateInput): Promise<FinancialCategoryModel> {
        return this.prisma.financialCategory.update({ where: { id },
data });
    }

    async softDeleteCategory(id: string): Promise<boolean> {
        const r = await this.prisma.financialCategory.updateMany({
            where: { id,
isDeleted: false },
            data: { isDeleted: true,
deletedAt: new Date() },
        });
        return r.count === 1;
    }

    // ── Contas / caixas ─────────────────────────────────────────────────────────
    listAccounts(includeInactive: boolean): Promise<FinancialAccountModel[]> {
        return this.prisma.financialAccount.findMany({
            where: { isDeleted: false,
...(includeInactive ? {} : { active: true }) },
            orderBy: [{ order: 'asc' }, { name: 'asc' }],
        });
    }

    findAccountById(id: string): Promise<FinancialAccountModel | null> {
        return this.prisma.financialAccount.findFirst({ where: { id,
isDeleted: false } });
    }

    createAccount(data: FinanceAccountCreateInput): Promise<FinancialAccountModel> {
        return this.prisma.financialAccount.create({ data });
    }

    updateAccount(id: string, data: FinanceAccountUpdateInput): Promise<FinancialAccountModel> {
        return this.prisma.financialAccount.update({ where: { id },
data });
    }

    async softDeleteAccount(id: string): Promise<boolean> {
        const r = await this.prisma.financialAccount.updateMany({
            where: { id,
isDeleted: false },
            data: { isDeleted: true,
deletedAt: new Date() },
        });
        return r.count === 1;
    }

    // ── Lançamentos ─────────────────────────────────────────────────────────
    async listTransactions(
        filters: FinanceTransactionFilters,
    ): Promise<{
 items: FinanceTransactionWithCategory[];
total: number 
}> {
        const where = await this.buildWhere(filters);
        const [items, total] = await Promise.all([
            this.prisma.financialTransaction.findMany({
                where,
                include: {
                    category: true,
                    account: true,
                    attachments: { ...attachmentMetaSelect,
orderBy: { createdAt: 'asc' } },
                },
                orderBy: transactionOrder(filters.orderBy),
                skip: filters.skip,
                take: filters.take,
            }),
            this.prisma.financialTransaction.count({ where }),
        ]);
        return { items,
total };
    }

    async listTransactionsForExport(
        filters: Omit<FinanceTransactionFilters, 'skip' | 'take'>,
    ): Promise<FinanceTransactionWithCategory[]> {
        return this.prisma.financialTransaction.findMany({
            where: await this.buildWhere(filters),
            include: {
                category: true,
                account: true,
                attachments: { ...attachmentMetaSelect,
orderBy: { createdAt: 'asc' } },
            },
            orderBy: transactionOrder(filters.orderBy),
        });
    }

    async sumTransactions(
        filters: Omit<FinanceTransactionFilters, 'skip' | 'take'>,
    ): Promise<FinanceTransactionSum[]> {
        const where = await this.buildWhere(filters);
        // Soma por tipo só dos lançamentos comuns: transferência entre caixas não
        // entra em receita/despesa (mesma regra do dashboard).
        const plain = await this.prisma.financialTransaction.groupBy({
            by: ['type'],
            where: { ...where,
transferId: null },
            _sum: { amountCents: true },
        });
        type Group = {
            type: FinanceTransactionSum['type'];
            _sum: { amountCents: number | null };
        };
        const toSum = (transfer: boolean) => (g: Group): FinanceTransactionSum => ({
            type: g.type,
            transfer,
            amountCents: g._sum.amountCents ?? 0,
        });
        return plain.map(toSum(false));
    }

    findTransactionById(id: string): Promise<FinancialTransactionModel | null> {
        return this.prisma.financialTransaction.findFirst({ where: { id,
isDeleted: false } });
    }

    // Os ids das relacoes (categoryId, accountId) vao soltos no `data`, que no
    // Prisma e a variante "Unchecked" do input; o TypeScript nao escolhe o ramo
    // da uniao sozinho. A anotacao continua conferindo campo a campo.
    async createTransaction(
        data: FinanceTransactionCreateInput,
    ): Promise<FinanceNumberedWrite<FinancialTransactionModel>> {
        const { number: typed, ...rest } = data;
        let tried: number | undefined = typed;
        try {
            return await this.prisma.$transaction(async (tx: unknown) => {
                const t = tx as PrismaClient;
                await lockFinanceNumbers(t);
                const picked = await pickFinanceNumber(numberReader(t), typed);
                if ('conflict' in picked) return picked;
                tried = picked.number;
                const result = await t.financialTransaction.create({
                    data: { ...rest,
number: picked.number } as FinancialTransactionUncheckedCreateInput,
                });
                return { result };
            });
        } catch (e) {
            return this.numberTakenConflict(e, tried);
        }
    }

    async updateTransaction(
        id: string,
        data: FinanceTransactionUpdateInput,
    ): Promise<FinanceNumberedWrite<FinancialTransactionModel>> {
        const { number: typed, ...rest } = data;
        // Sem trocar o Nº, não há o que travar.
        if (typed === undefined) {
            const result = await this.prisma.financialTransaction.update({
                where: { id },
                data: rest as FinancialTransactionUncheckedUpdateInput,
            });
            return { result };
        }
        try {
            return await this.prisma.$transaction(async (tx: unknown) => {
                const t = tx as PrismaClient;
                await lockFinanceNumbers(t);
                // Manter o próprio número não é conflito.
                const picked = await pickFinanceNumber(numberReader(t), typed, id);
                if ('conflict' in picked) return picked;
                const result = await t.financialTransaction.update({
                    where: { id },
                    data: { ...rest,
number: picked.number } as FinancialTransactionUncheckedUpdateInput,
                });
                return { result };
            });
        } catch (e) {
            return this.numberTakenConflict(e, typed);
        }
    }

    async nextTransactionNumber(): Promise<number> {
        return nextFinanceNumber(await numberReader(this.prisma).maxNumber());
    }

    /**
     * Defesa final (decisão 005, item 3): se o índice único recusar o Nº mesmo
     * com a trava (alguém gravou fora dela), responde o conflito, e nada fica
     * gravado repetido. Qualquer outro erro sobe como veio.
     */
    private async numberTakenConflict(
        e: unknown,
        tried: number | undefined,
    ): Promise<{ conflict: FinanceNumberConflict }> {
        if (tried === undefined || !isNumberTaken(e)) throw e;
        const owner = await this.prisma.financialTransaction.findUnique({
            where: { number: tried },
            select: { isDeleted: true },
        });
        return { conflict: { number: tried,
deleted: owner?.isDeleted ?? false } };
    }

    async softDeleteTransaction(id: string): Promise<boolean> {
        const r = await this.prisma.financialTransaction.updateMany({
            where: { id,
isDeleted: false },
            data: { isDeleted: true,
deletedAt: new Date() },
        });
        return r.count === 1;
    }

    // Dois números seguidos, dentro da trava: a saída, gravada primeiro, leva o
    // menor; a entrada, o seguinte.
    async createTransfer(input: FinanceTransferInput): Promise<FinancialTransactionModel[]> {
        const transferId = randomUUID();
        const base = {
            transferId,
            amountCents: input.amountCents,
            date: input.date,
            description: input.description,
            method: input.method ?? null,
            createdBy: input.createdBy ?? null,
        };
        return this.prisma.$transaction(async (tx: unknown) => {
            const t = tx as PrismaClient;
            await lockFinanceNumbers(t);
            const first = nextFinanceNumber(await numberReader(t).maxNumber());
            const out = await t.financialTransaction.create({
                data: { ...base,
number: first,
type: 'OUT',
accountId: input.fromAccountId },
            });
            const into = await t.financialTransaction.create({
                data: { ...base,
number: first + 1,
type: 'IN',
accountId: input.toAccountId },
            });
            return [out, into];
        });
    }

    async softDeleteTransfer(transferId: string): Promise<boolean> {
        const r = await this.prisma.financialTransaction.updateMany({
            where: { transferId,
isDeleted: false },
            data: { isDeleted: true,
deletedAt: new Date() },
        });
        return r.count > 0;
    }

    listTransferLegs(transferId: string): Promise<FinancialTransactionModel[]> {
        return this.prisma.financialTransaction.findMany({
            where: {
                transferId,
                isDeleted: false,
            },
        });
    }

    // ── Comprovantes ──────────────────────────────────────────────────────────
    async addAttachment(
        transactionId: string,
        data: Buffer,
        filename: string,
        mimeType: string,
        size: number,
    ): Promise<FinanceAttachmentMeta> {
        return this.prisma.financialAttachment.create({
            // Buffer e um Uint8Array no runtime; so o generico do ArrayBuffer
            // difere. Copiar o comprovante inteiro so pelo tipo seria caro.
            data: { transactionId,
data: data as Uint8Array<ArrayBuffer>,
filename,
mimeType,
size },
            ...attachmentMetaSelect,
        });
    }

    async getAttachment(id: string): Promise<FinanceAttachmentFile | null> {
        // Não expor comprovantes de lançamentos soft-deletados.
        const row = await this.prisma.financialAttachment.findFirst({
            where: { id,
transaction: { isDeleted: false } },
        });
        if (!row) return null;
        return { data: Buffer.from(row.data),
filename: row.filename,
mimeType: row.mimeType };
    }

    async deleteAttachment(id: string): Promise<boolean> {
        try {
            await this.prisma.financialAttachment.delete({ where: { id } });
            return true;
        } catch (e) {
            return semRegistro(e, false);
        }
    }

    // ── Dashboard ───────────────────────────────────────────────────────────
    async summary(from: Date, to: Date): Promise<FinanceSummary> {
        // Saldo histórico (caixa atual) — não respeita o período.
        const [allIn, allOut] = await Promise.all([
            this.prisma.financialTransaction.aggregate({
                where: { isDeleted: false,
type: 'IN' },
                _sum: { amountCents: true },
            }),
            this.prisma.financialTransaction.aggregate({
                where: { isDeleted: false,
type: 'OUT' },
                _sum: { amountCents: true },
            }),
        ]);
        const balanceAllTimeCents =
            (allIn._sum.amountCents ?? 0) - (allOut._sum.amountCents ?? 0);

        // Saldo acumulado por conta/caixa (todas as datas).
        const [accounts, grouped] = await Promise.all([
            this.prisma.financialAccount.findMany({
                where: { isDeleted: false },
                orderBy: [{ order: 'asc' }, { name: 'asc' }],
            }),
            this.prisma.financialTransaction.groupBy({
                by: ['accountId', 'type'],
                where: { isDeleted: false },
                _sum: { amountCents: true },
            }),
        ]);
        // Só as caixas ativas viram linha própria; lançamentos apontando para uma
        // caixa soft-deletada (ou sem caixa) caem em "Sem caixa" — assim
        // sum(byAccount) fecha com balanceAllTimeCents.
        const activeAccountIds = new Set((accounts as FinancialAccountModel[]).map(a => a.id));
        const acctBal = new Map<string, number>();
        for (const g of grouped) {
            // "Só nota" (sem tipo) não é dinheiro: fica fora do saldo, como no
            // saldo histórico. Antes caía no `-1` e tirava o valor da caixa.
            if (g.type !== 'IN' && g.type !== 'OUT') continue;
            const key = g.accountId && activeAccountIds.has(g.accountId) ? g.accountId : '__none';
            const delta = (g._sum.amountCents ?? 0) * (g.type === 'IN' ? 1 : -1);
            acctBal.set(key, (acctBal.get(key) ?? 0) + delta);
        }
        const byAccount = (accounts as FinancialAccountModel[]).map(a => ({
            accountId: a.id as string | null,
            name: a.name,
            color: a.color,
            balanceCents: acctBal.get(a.id) ?? 0,
        }));
        const noneBal = acctBal.get('__none') ?? 0;
        if (noneBal !== 0) {
            byAccount.push({ accountId: null,
name: 'Sem caixa',
color: '#94a3b8',
balanceCents: noneBal });
        }

        // Lançamentos do período → agregações em JS (volume pequeno).
        const rows = await this.prisma.financialTransaction.findMany({
            where: { isDeleted: false,
date: { gte: from,
lte: to } },
            include: { category: true },
        });

        let periodInCents = 0;
        let periodOutCents = 0;
        const catMap = new Map<
            string,
            {
 categoryId: string | null;
name: string;
color: string;
type: 'IN' | 'OUT';
totalCents: number 
}
        >();
        const monthMap = new Map<string, {
 inCents: number;
outCents: number 
}>();

        for (const t of rows) {
            // Transferências entre caixas não são receita/despesa — fora dos KPIs,
            // categorias e gráfico mensal (mas contam no saldo por caixa, via groupBy).
            if (t.transferId) continue;
            // "Só nota" (sem tipo) não é receita/despesa — fora de KPIs, categorias
            // e gráfico mensal (e já não conta no saldo, que soma só IN/OUT).
            if (!t.type) continue;
            if (t.type === 'IN') periodInCents += t.amountCents;
            else periodOutCents += t.amountCents;

            const catKey = t.categoryId ?? `__none_${t.type}`;
            const existing = catMap.get(catKey);
            if (existing) {
                existing.totalCents += t.amountCents;
            } else {
                catMap.set(catKey, {
                    categoryId: t.categoryId,
                    name: t.category?.name ?? 'Sem categoria',
                    color: t.category?.color ?? '#94a3b8',
                    type: t.type,
                    totalCents: t.amountCents,
                });
            }

            const month = t.date.toISOString().slice(0, 7); // YYYY-MM
            const m = monthMap.get(month) ?? { inCents: 0,
outCents: 0 };
            if (t.type === 'IN') m.inCents += t.amountCents;
            else m.outCents += t.amountCents;
            monthMap.set(month, m);
        }

        const byCategory = [...catMap.values()].sort((a, b) => b.totalCents - a.totalCents);
        const byMonth = [...monthMap.entries()]
            .map(([month, v]) => ({ month,
...v }))
            .sort((a, b) => a.month.localeCompare(b.month));

        return {
            balanceAllTimeCents,
            periodInCents,
            periodOutCents,
            periodResultCents: periodInCents - periodOutCents,
            byCategory,
            byMonth,
            byAccount,
        };
    }

    private async buildWhere(filters: Omit<FinanceTransactionFilters, 'skip' | 'take'>) {
        const where: Record<string, unknown> = { isDeleted: false };
        if (filters.type) where.type = filters.type;
        if (filters.categoryId) where.categoryId = filters.categoryId;
        if (filters.accountId) where.accountId = filters.accountId;
        if (filters.from || filters.to) {
            where.date = {
                ...(filters.from ? { gte: filters.from } : {}),
                ...(filters.to ? { lte: filters.to } : {}),
            };
        }
        if (filters.method) {
            // Valores antigos são texto livre (PIX/pix/Pix) — compara sem caixa.
            where.method = { equals: filters.method,
mode: 'insensitive' };
        }
        if (filters.search) {
            // Descrição, o Nº (termo só de dígitos, igual), ou a Nota de Empenho:
            // razão social, nome fantasia, CNPJ/CPF e "Nº anterior". Esses dados
            // ficam num JSON, que o Prisma só filtra diferenciando maiúscula e
            // sem tirar pontuação; por isso os ids vêm de SQL.
            const byEmpenho = await this.idsByEmpenho(filters.search);
            const number = financeNumberSearchTerm(filters.search);
            where.OR = [
                { description: { contains: filters.search,
mode: 'insensitive' } },
                ...(number !== null ? [{ number }] : []),
                ...(byEmpenho.length ? [{ id: { in: byEmpenho } }] : []),
            ];
        }
        return where;
    }

    private async idsByEmpenho(term: string): Promise<string[]> {
        // Nome: sem caixa e sem acento (a mesma função da busca de pessoas).
        // % e _ digitados valem como texto; o escape padrão do LIKE no Postgres é a barra.
        const like = `%${searchKey(term).replace(/[\\%_]/g, c => `\\${c}`)}%`;
        // CNPJ/CPF (SR-056): quando o termo parece documento e tem 3 ou mais
        // dígitos, compara só os dígitos dos dois lados. O empenho guarda o
        // documento como foi digitado, com ou sem pontuação.
        const digits = docDigitsOf(term.trim());
        const docLike = digits.length >= 3 ? `%${digits}%` : null;
        // "Nº anterior" (`empenho.numero`, o antigo "Nº empenho"; decisão 005):
        // termo só de dígitos acha o igual sem contar os zeros à esquerda ("45"
        // acha "0045", mas não "1450"); outro termo acha o que contém, como os nomes.
        const onlyDigits = /^[0-9]+$/.test(term.trim());
        const previousEq = onlyDigits ? term.trim().replace(/^0+/, '') : null;
        const previousLike = onlyDigits ? null : like;
        const rows = await this.prisma.$queryRaw<{ id: string }[]>`
            SELECT "id" FROM "FinancialTransaction"
            WHERE "isDeleted" = false
              AND (immutable_unaccent_lower("empenho"->>'razaoSocial') LIKE ${like}
                OR immutable_unaccent_lower("empenho"->>'nomeFantasia') LIKE ${like}
                OR (${docLike}::text IS NOT NULL
                    AND regexp_replace("empenho"->>'cnpjCpf', '[^0-9]', '', 'g') LIKE ${docLike}::text)
                OR (${previousEq}::text IS NOT NULL
                    AND btrim("empenho"->>'numero') ~ '^[0-9]+$'
                    AND ltrim(btrim("empenho"->>'numero'), '0') = ${previousEq}::text)
                OR (${previousLike}::text IS NOT NULL
                    AND immutable_unaccent_lower("empenho"->>'numero') LIKE ${previousLike}::text))`;
        return rows.map(r => r.id);
    }

    // ── Recorrentes ─────────────────────────────────────────────────────────
    listRecurrences(includeInactive: boolean): Promise<FinanceRecurrenceWithRefs[]> {
        return this.prisma.financeRecurringTransaction.findMany({
            where: { isDeleted: false,
...(includeInactive ? {} : { active: true }) },
            include: { category: true,
account: true },
            orderBy: [{ active: 'desc' }, { description: 'asc' }],
        });
    }

    listRecurrencesToGenerate(): Promise<FinanceRecurringTransactionModel[]> {
        return this.prisma.financeRecurringTransaction.findMany({
            where: { isDeleted: false,
active: true },
            orderBy: { createdAt: 'asc' },
        });
    }

    findRecurrenceById(id: string): Promise<FinanceRecurringTransactionModel | null> {
        return this.prisma.financeRecurringTransaction.findFirst({ where: { id,
isDeleted: false } });
    }

    createRecurrence(data: FinanceRecurrenceCreateInput): Promise<FinanceRecurringTransactionModel> {
        return this.prisma.financeRecurringTransaction.create({ data });
    }

    updateRecurrence(
        id: string,
        data: FinanceRecurrenceUpdateInput,
    ): Promise<FinanceRecurringTransactionModel> {
        return this.prisma.financeRecurringTransaction.update({ where: { id },
data });
    }

    async softDeleteRecurrence(id: string): Promise<boolean> {
        // Só o molde é marcado como excluído: os lançamentos já gerados ficam.
        const r = await this.prisma.financeRecurringTransaction.updateMany({
            where: { id,
isDeleted: false },
            data: { isDeleted: true,
deletedAt: new Date(),
active: false },
        });
        return r.count === 1;
    }

    async createRecurrenceTransaction(run: FinanceRecurrenceRun): Promise<boolean> {
        try {
            await this.prisma.$transaction(async (tx: unknown) => {
                const t = tx as PrismaClient;
                await lockFinanceNumbers(t);
                await t.financialTransaction.create({
                    data: {
                        number: nextFinanceNumber(await numberReader(t).maxNumber()),
                        recurringId: run.recurringId,
                        recurringMonth: run.recurringMonth,
                        type: run.type,
                        amountCents: run.amountCents,
                        date: run.date,
                        description: run.description,
                        method: run.method ?? null,
                        notes: run.notes ?? null,
                        categoryId: run.categoryId ?? null,
                        accountId: run.accountId ?? null,
                    },
                });
            });
            return true;
        } catch (e) {
            // Só o P2002 do par (recurringId, recurringMonth) quer dizer "este mês
            // já foi gerado". Antes todo P2002 era tratado assim, e uma colisão
            // de Nº seria engolida calada. A gravação falhou dentro da
            // transação, então o número não foi gasto: a sequência não fica
            // com buraco.
            if (isRecurrenceMonthTaken(e)) return false;
            throw e;
        }
    }

    async setRecurrenceLastGeneratedMonth(id: string, month: string): Promise<void> {
        await this.prisma.financeRecurringTransaction.update({
            where: { id },
            data: { lastGeneratedMonth: month },
        });
    }

    // ── Formas de pagamento ─────────────────────────────────────────────────
    listPaymentMethods(includeInactive: boolean): Promise<FinancePaymentMethodModel[]> {
        return this.prisma.financePaymentMethod.findMany({
            where: { isDeleted: false,
...(includeInactive ? {} : { active: true }) },
            orderBy: [{ order: 'asc' }, { name: 'asc' }],
        });
    }

    findPaymentMethodByName(name: string): Promise<FinancePaymentMethodModel | null> {
        return this.prisma.financePaymentMethod.findFirst({ where: { name } });
    }

    createPaymentMethod(data: FinancePaymentMethodCreateInput): Promise<FinancePaymentMethodModel> {
        return this.prisma.financePaymentMethod.create({ data });
    }

    updatePaymentMethod(
        id: string,
        data: FinancePaymentMethodUpdateInput,
    ): Promise<FinancePaymentMethodModel> {
        return this.prisma.financePaymentMethod.update({ where: { id },
data });
    }

    async softDeletePaymentMethod(id: string): Promise<boolean> {
        const r = await this.prisma.financePaymentMethod.updateMany({
            where: { id,
isDeleted: false },
            data: { isDeleted: true,
deletedAt: new Date(),
active: false },
        });
        return r.count === 1;
    }

    // ── Fechamento mensal ───────────────────────────────────────────────────
    listClosings(filters: {
 accountId?: string;
year?: string 
}): Promise<FinanceMonthlyClosingModel[]> {
        return this.prisma.financeMonthlyClosing.findMany({
            where: {
                ...(filters.accountId ? { accountId: filters.accountId } : {}),
                // Mês é "YYYY-MM" — o ano é o prefixo.
                ...(filters.year ? { month: { startsWith: `${filters.year}-` } } : {}),
            },
            orderBy: [{ month: 'desc' }, { closedAt: 'desc' }],
        });
    }

    findClosing(accountId: string, month: string): Promise<FinanceMonthlyClosingModel | null> {
        return this.prisma.financeMonthlyClosing.findFirst({ where: { accountId,
month } });
    }

    async findClosedMonths(pairs: FinanceAccountMonth[]): Promise<FinanceClosedMonth[]> {
        if (pairs.length === 0) return [];
        const rows = await this.prisma.financeMonthlyClosing.findMany({
            where: {
                OR: pairs.map(p => ({
                    accountId: p.accountId,
                    month: p.month,
                })),
            },
            include: { account: { select: { name: true } } },
            orderBy: { month: 'asc' },
        });
        return rows.map(r => ({
            accountId: r.accountId,
            month: r.month,
            accountName: r.account.name,
        }));
    }

    async accountMonthMovement(
        accountId: string,
        from: Date,
        to: Date,
    ): Promise<FinanceAccountMonthMovement> {
        // Saldo de abertura = tudo que entrou/saiu do caixa ANTES do mês.
        // Transferências entre caixas contam (movem dinheiro de verdade);
        // "só nota" (type null) não, porque nem vira linha no groupBy.
        const [before, inside] = await Promise.all([
            this.prisma.financialTransaction.groupBy({
                by: ['type'],
                where: { isDeleted: false,
accountId,
date: { lt: from } },
                _sum: { amountCents: true },
            }),
            this.prisma.financialTransaction.groupBy({
                by: ['type'],
                where: { isDeleted: false,
accountId,
date: { gte: from,
lte: to } },
                _sum: { amountCents: true },
            }),
        ]);
        type Group = {
 type: FinancialType | null;
_sum: { amountCents: number | null } 
};
        const pick = (rows: Group[], type: FinancialType) =>
            rows.find(r => r.type === type)?._sum.amountCents ?? 0;
        const openingCents = pick(before, 'IN') - pick(before, 'OUT');
        return { openingCents,
inCents: pick(inside, 'IN'),
outCents: pick(inside, 'OUT') };
    }

    createClosing(data: FinanceClosingCreateInput): Promise<FinanceMonthlyClosingModel> {
        return this.prisma.financeMonthlyClosing.create({ data });
    }

    async deleteClosing(id: string): Promise<boolean> {
        try {
            await this.prisma.financeMonthlyClosing.delete({ where: { id } });
            return true;
        } catch (e) {
            return semRegistro(e, false);
        }
    }
}
