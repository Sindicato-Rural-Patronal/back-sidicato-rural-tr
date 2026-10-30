/**
 * Detecta violação de unicidade do Prisma (P2002) sem depender do tipo
 * concreto do erro (o client gerado varia entre versões).
 */
export function isPrismaUniqueViolation(error: unknown): boolean {
    return (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: unknown }).code === 'P2002'
    );
}

/** Violação de chave estrangeira (P2003) — registro em uso por outro. */
export function isPrismaFkViolation(error: unknown): boolean {
    return (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: unknown }).code === 'P2003'
    );
}

/**
 * Conflito de escrita concorrente numa transação (Postgres 40001/40P01): quem
 * perde pode tentar de novo. Chega de dois jeitos: como P2034 do Prisma ou,
 * com o driver adapter (`@prisma/adapter-pg`), como `DriverAdapterError` sem
 * `code` e com `cause.kind: 'TransactionWriteConflict'`. Só o P2034 era
 * reconhecido, então a nova tentativa do `createWithCapacity` e do
 * `register-full` nunca rodava e quem perdia a corrida levava 500.
 */
export function isPrismaSerializationError(error: unknown): boolean {
    let current: unknown = error;
    // A causa pode vir embrulhada (erro do Prisma → erro do adapter).
    for (let depth = 0; depth < 4 && typeof current === 'object' && current !== null; depth++) {
        const e = current as {
 code?: unknown;
kind?: unknown;
cause?: unknown 
};
        if (e.code === 'P2034' || e.kind === 'TransactionWriteConflict') return true;
        current = e.cause;
    }
    return false;
}

/**
 * SQLSTATE do Postgres que o driver adapter devolveu, quando há (ex.: "22008").
 * Erros que o Prisma não traduz chegam como P2039 (ou P2010 em SQL cru), com o
 * código em `meta.driverAdapterError.cause`; os traduzidos (P2020…) podem trazer
 * só `cause` no próprio erro.
 */
export function postgresSqlState(error: unknown): string | null {
    let current: unknown = error;
    for (let depth = 0; depth < 4 && typeof current === 'object' && current !== null; depth++) {
        const e = current as {
            originalCode?: unknown;
            meta?: { driverAdapterError?: unknown };
            cause?: unknown;
        };
        if (typeof e.originalCode === 'string') return e.originalCode;
        current = e.meta?.driverAdapterError ?? e.cause;
    }
    return null;
}

interface UniqueConstraint {
    index?: unknown;
    fields?: unknown;
}

interface UniqueViolationMeta {
    target?: unknown;
    driverAdapterError?: { cause?: { constraint?: UniqueConstraint } };
}

/**
 * Qual índice único foi violado (P2002): os nomes de colunas e do índice que o
 * erro traz. O Prisma sem driver adapter põe em `meta.target` (array de colunas
 * ou o nome do índice). Com o `@prisma/adapter-pg`, o nosso, `meta.target` não
 * vem: vem `meta.driverAdapterError.cause.constraint`, com `index` (o nome do
 * índice, medido no E2E em 30/10) ou `fields`. Lê os dois, `meta.target` primeiro.
 *
 * É a única leitura do índice violado. Havia outra, `uniqueViolationFields`, que
 * só olhava `meta.target` e devolvia sempre `[]` com o adapter-pg (SR-069): quem
 * a usava caía no "senão" e respondia como se todo P2002 fosse o do CPF.
 */
export function uniqueViolationTarget(error: unknown): string[] {
    if (!isPrismaUniqueViolation(error)) return [];
    const meta = (error as { meta?: UniqueViolationMeta }).meta;
    const out: string[] = [];
    const target = meta?.target;
    if (Array.isArray(target)) out.push(...target.map(String));
    else if (typeof target === 'string') out.push(target);
    const constraint = meta?.driverAdapterError?.cause?.constraint;
    if (typeof constraint?.index === 'string') out.push(constraint.index);
    if (Array.isArray(constraint?.fields)) out.push(...constraint.fields.map(String));
    return out;
}
