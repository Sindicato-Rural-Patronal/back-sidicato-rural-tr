// Normalização de texto usada em nomes, títulos e nomes de arquivo.

/** Remove acentos (NFD + marcas combinantes). */
export function stripAccents(value: string): string {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** MAIÚSCULO, sem acento e sem espaço sobrando — padrão dos cadastros. */
export function upperNoAccents(value: string): string {
    return stripAccents(value).replace(/\s+/g, ' ').trim().toUpperCase();
}
