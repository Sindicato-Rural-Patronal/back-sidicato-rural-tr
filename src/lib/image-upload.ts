import sharp from 'sharp';

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

/**
 * Regrava a imagem como JPEG, girada pelo EXIF e reduzida para caber em
 * `maxSide`×`maxSide` (nunca aumenta). O arquivo que vai para o bucket público
 * é sempre um JPEG gerado aqui, nunca o que o cliente mandou: um HTML ou SVG
 * declarado como imagem não passa do sharp. Devolve null se não for imagem.
 */
export async function toJpeg(data: Buffer, maxSide: number): Promise<Buffer | null> {
    try {
        return await sharp(data)
            .rotate()
            .resize(maxSide, maxSide, { fit: 'inside',
withoutEnlargement: true })
            .jpeg({ quality: 85,
mozjpeg: true })
            .toBuffer();
    } catch {
        return null;
    }
}

export const UNREADABLE_IMAGE = 'Não foi possível ler a imagem. Envie outro arquivo.';
