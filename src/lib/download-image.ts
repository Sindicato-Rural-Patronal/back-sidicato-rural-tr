import { MAX_IMAGE_BYTES } from './image-upload.js';

export type DownloadedImage = {
    data: Buffer;
    mimeType: string;
};

/** Origem do storage (SUPABASE_URL); `null` quando não configurado. */
function storageOrigin(): string | null {
    try {
        return process.env.SUPABASE_URL ? new URL(process.env.SUPABASE_URL).origin : null;
    } catch {
        return null;
    }
}

/**
 * Baixa uma imagem do nosso storage (ex.: capa de curso já gravada). Usado ao
 * duplicar curso: a capa é baixada e enviada de novo para o curso novo, que
 * ganha o próprio arquivo. Só aceita URL do próprio storage e não segue
 * redirecionamento — o servidor nunca busca endereço arbitrário. Qualquer falha
 * (URL inválida ou de fora, HTTP != 2xx, tempo esgotado, arquivo vazio ou
 * grande demais) devolve `null`.
 */
export async function downloadImage(
    url: string,
    timeoutMs = 15_000,
    allowedOrigin: string | null = storageOrigin(),
): Promise<DownloadedImage | null> {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return null;
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    if (!allowedOrigin || parsed.origin !== allowedOrigin) return null;

    try {
        const res = await fetch(parsed, { signal: AbortSignal.timeout(timeoutMs),
redirect: 'error' });
        if (!res.ok) return null;
        const data = Buffer.from(await res.arrayBuffer());
        if (data.length === 0 || data.length > MAX_IMAGE_BYTES) return null;
        const mimeType = (res.headers.get('content-type') ?? 'image/jpeg').split(';')[0].trim().toLowerCase();
        return { data,
mimeType };
    } catch {
        return null;
    }
}
