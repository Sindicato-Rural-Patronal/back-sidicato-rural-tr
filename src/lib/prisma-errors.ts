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
