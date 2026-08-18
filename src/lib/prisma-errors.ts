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
