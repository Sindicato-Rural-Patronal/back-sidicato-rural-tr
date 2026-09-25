/**
 * Nome usado quando o curso e criado (ou salvo) sem titulo. O painel deixa
 * comecar o cadastro so com a sala e as datas, para o curso ja entrar na
 * agenda; o titulo vem depois. Sem este nome o curso apareceria como uma linha
 * em branco nas listas, na agenda e nos PDFs.
 *
 * Em caixa alta porque os titulos de curso sao gravados assim (o formulario do
 * painel forca maiuscula): "Curso sem nome" ficaria destoando dos vizinhos.
 */
export const CURSO_SEM_NOME = 'CURSO SEM NOME';

/** Devolve o titulo digitado, ou o generico quando veio vazio/so espacos. */
export function nomeDoCurso(name: string | null | undefined): string {
    return (name ?? '').trim() || CURSO_SEM_NOME;
}
