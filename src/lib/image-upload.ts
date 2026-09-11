// Validação compartilhada de upload de imagem (avatar, banners, logo, fotos).
export const ALLOWED_IMAGE_MIMES = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
]);
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024; // 15MB

// Retorna mensagem de erro se inválido, ou null se ok.
export function validateImageUpload(data: Buffer, mimeType: string): string | null {
    if (!ALLOWED_IMAGE_MIMES.has(mimeType)) {
        return 'Formato não aceito. Envie JPG, PNG, WEBP ou GIF.';
    }
    if (data.length === 0) return 'Arquivo vazio.';
    if (data.length > MAX_IMAGE_BYTES) return 'Arquivo excede o limite de 15MB.';
    return null;
}
