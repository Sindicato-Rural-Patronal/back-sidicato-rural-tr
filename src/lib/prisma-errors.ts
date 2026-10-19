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
 * Campos/índice envolvidos numa violação de unicidade (P2002). Prisma expõe
 * `meta.target` como array de colunas ou, para índices nomeados, uma string.
 */
export function uniqueViolationFields(error: unknown): string[] {
    if (!isPrismaUniqueViolation(error)) return [];
    const target = (error as { meta?: { target?: unknown } }).meta?.target;
    if (Array.isArray(target)) return target.map(String);
    if (typeof target === 'string') return [target];
    return [];
}
