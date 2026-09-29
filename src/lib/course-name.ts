/**
 * Nome usado quando o curso e criado (ou salvo) sem titulo. O painel deixa
 * comecar o cadastro so com a sala e as datas, para o curso ja entrar na
 * agenda; o titulo vem depois. Sem este nome o curso apareceria como uma linha
 * em branco nas listas, na agenda e nos PDFs.
 *
 * Escrito como frase: o titulo do curso aparece no site e o formulario do
 * painel deixou de forcar maiuscula. Cursos criados antes disso podem ter
 * "CURSO SEM NOME" gravado; nao vale reescrever o que ja esta no banco.
 */
export const CURSO_SEM_NOME = 'Curso sem nome';

/** Devolve o titulo digitado, ou o generico quando veio vazio/so espacos. */
export function nomeDoCurso(name: string | null | undefined): string {
    return (name ?? '').trim() || CURSO_SEM_NOME;
}
