// Por que existe: os adapters devolvem `null`/`false` quando o registro não
// existe — é assim que os usecases respondem "não encontrado". O jeito curto de
// escrever isso era `try { ... } catch { return null }`, que engole TUDO: banco
// fora do ar, chave estrangeira violada, coluna que não existe. O painel então
// dizia "curso não encontrado" para um problema de infraestrutura, e nada ia
// parar no log — incidente impossível de diagnosticar.
//
// Aqui a diferença fica explícita: registro inexistente é resposta de negócio,
// o resto sobe e vira 500 com rastro.

/**
 * Códigos do Prisma para "o registro que a operação precisava não existe".
 * P2025 é o do update/delete por id inexistente; os outros aparecem em
 * relações e leituras que não acharam o alvo.
 */
const REGISTRO_INEXISTENTE = new Set(['P2025', 'P2001', 'P2016', 'P2018']);

export function registroInexistente(erro: unknown): boolean {
    const code = (erro as { code?: unknown } | null)?.code;
    return typeof code === 'string' && REGISTRO_INEXISTENTE.has(code);
}

/**
 * `catch (e) { return semRegistro(e, null) }` — devolve o valor combinado
 * quando o registro não existe e **relança** qualquer outra falha.
 */
export function semRegistro<T>(erro: unknown, valor: T): T {
    if (registroInexistente(erro)) return valor;
    throw erro;
}
