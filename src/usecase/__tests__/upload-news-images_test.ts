import { describe, it, expect, vi, beforeEach } from 'vitest';
import sharp from 'sharp';
import { UploadNewsBannerUseCase } from '../upload-news-banner.js';
import { UploadNewsBlockImageUseCase } from '../upload-news-block-image.js';
import type { NewsRepository } from '../../ports/external/news-repository.js';
import type { StorageRepository } from '../../ports/external/storage-repository.js';
import { NewsNotFoundError } from '../../errors/not-found.js';
import { ValidationError } from '../../errors/validation.js';

const repo = {
    findById: vi.fn(),
    updateBanner: vi.fn(),
} as unknown as NewsRepository;

const storage = {
    uploadFile: vi.fn(),
    getPublicUrl: vi.fn((bucket: string, key: string) => `https://cdn.test/${bucket}/${key}`),
    deleteFile: vi.fn(),
} as unknown as StorageRepository;

async function png(width: number, height: number) {
    return sharp({ create: { width,
height,
channels: 3,
background: '#3a7' } }).png().toBuffer();
}

const html = Buffer.from('<html><script>alert(1)</script></html>');

// Os dois uploads de notícia (capa e imagem do texto) vão para um bucket
// público: o arquivo gravado tem de ser sempre um JPEG gerado pelo sharp.
describe.each([
    ['capa', () => new UploadNewsBannerUseCase(storage, repo), 1920],
    ['imagem do bloco', () => new UploadNewsBlockImageUseCase(storage, repo), 1600],
] as const)('upload de notícia (%s)', (_label, make, maxSide) => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(repo.findById).mockResolvedValue({ id: 'n1' } as never);
        vi.mocked(repo.updateBanner).mockResolvedValue({ id: 'n1' } as never);
        vi.mocked(storage.uploadFile).mockResolvedValue({ location: '',
key: '',
bucket: '' });
    });

    it('grava um JPEG reduzido, nunca o arquivo como chegou', async () => {
        const r = await make().execute('n1', await png(4000, 1000), 'image/png');
        expect(r.error).toBeUndefined();
        const sent = vi.mocked(storage.uploadFile).mock.calls[0][0];
        expect(sent.contentType).toBe('image/jpeg');
        const meta = await sharp(sent.body as Buffer).metadata();
        expect(meta.format).toBe('jpeg');
        expect(meta.width).toBe(maxSide);
        expect(meta.height).toBe(maxSide / 4);
    });

    it('recusa tipo que não é imagem, sem tocar no storage', async () => {
        const r = await make().execute('n1', html, 'text/html');
        expect(r.error).toBeInstanceOf(ValidationError);
        expect(storage.uploadFile).not.toHaveBeenCalled();
    });

    it('recusa HTML declarado como imagem', async () => {
        const r = await make().execute('n1', html, 'image/png');
        expect(r.error).toBeInstanceOf(ValidationError);
        expect(r.error?.message).toMatch(/ler a imagem/);
        expect(storage.uploadFile).not.toHaveBeenCalled();
    });

    it('notícia inexistente → NewsNotFoundError (404)', async () => {
        vi.mocked(repo.findById).mockResolvedValue(null);
        const r = await make().execute('nada', await png(10, 10), 'image/png');
        expect(r.error).toBeInstanceOf(NewsNotFoundError);
        expect(storage.uploadFile).not.toHaveBeenCalled();
    });
});
