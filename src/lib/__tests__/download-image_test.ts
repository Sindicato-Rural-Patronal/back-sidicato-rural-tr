import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadImage } from '../download-image.js';

const STORAGE = 'https://abc.supabase.co';

describe('downloadImage', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('recusa URL fora do storage sem fazer requisição', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        expect(await downloadImage('http://169.254.169.254/latest/meta-data', 1000, STORAGE)).toBeNull();
        expect(await downloadImage('https://abc.supabase.co.evil.com/x.jpg', 1000, STORAGE)).toBeNull();
        expect(await downloadImage('file:///etc/passwd', 1000, STORAGE)).toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('recusa tudo quando o storage não está configurado', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        expect(await downloadImage(`${STORAGE}/storage/v1/object/public/b/c.jpg`, 1000, null)).toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('baixa do storage sem seguir redirecionamento', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            new Response(new Uint8Array([1, 2, 3]), { status: 200,
headers: { 'content-type': 'image/jpeg; q=1' } }),
        );
        vi.stubGlobal('fetch', fetchMock);

        const img = await downloadImage(`${STORAGE}/storage/v1/object/public/b/c.jpg`, 1000, STORAGE);

        expect(img?.mimeType).toBe('image/jpeg');
        expect(img?.data.length).toBe(3);
        expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: 'error' });
    });

    it('HTTP de erro, corpo vazio, URL inválida ou falha de rede → null', async () => {
        expect(await downloadImage('nao-e-url', 1000, STORAGE)).toBeNull();
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('x', { status: 404 })));
        expect(await downloadImage(`${STORAGE}/a.jpg`, 1000, STORAGE)).toBeNull();
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Uint8Array([]))));
        expect(await downloadImage(`${STORAGE}/a.jpg`, 1000, STORAGE)).toBeNull();
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')));
        expect(await downloadImage(`${STORAGE}/a.jpg`, 1000, STORAGE)).toBeNull();
    });
});
