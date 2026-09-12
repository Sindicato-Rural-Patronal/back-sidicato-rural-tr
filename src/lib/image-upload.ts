// Validação compartilhada de upload de imagem (avatar, banners, logo, fotos).
export const ALLOWED_IMAGE_MIMES = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
]);
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024; // 15MB

// Retorna mensagem de erro se inválido, ou null se ok.
// Sanitiza o nome de arquivo antes de compor a chave de storage — evita
// path traversal (../, separadores) e caracteres estranhos.
export function safeFilename(name: string): string {
    return (name || 'arquivo')
        .replace(/[/\\]/g, '_')
        .replace(/\.{2,}/g, '.')
        .replace(/[^\w.\-]/g, '_')
        .slice(0, 100);
}

export function validateImageUpload(data: Buffer, mimeType: string): string | null {
    if (!ALLOWED_IMAGE_MIMES.has(mimeType)) {
        return 'Formato não aceito. Envie JPG, PNG, WEBP ou GIF.';
    }
    if (data.length === 0) return 'Arquivo vazio.';
    if (data.length > MAX_IMAGE_BYTES) return 'Arquivo excede o limite de 15MB.';
    return null;
}
