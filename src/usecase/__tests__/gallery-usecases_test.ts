import { describe, it, expect, vi, beforeEach } from 'vitest';
import sharp from 'sharp';
import {
    CreateGalleryUseCase,
    UpdateGalleryUseCase,
    DeleteGalleryUseCase,
    ReorderGalleriesUseCase,
    UploadGalleryPhotoUseCase,
    UpdateGalleryPhotoUseCase,
    DeleteGalleryPhotoUseCase,
    ReorderGalleryPhotosUseCase,
    MAX_PHOTOS_PER_ALBUM,
} from '../gallery-usecases.js';
import type { GalleryRepository } from '../../ports/external/gallery-repository.js';
import type { StorageRepository } from '../../ports/external/storage-repository.js';
import { ValidationError } from '../../errors/validation.js';
import { GalleryAlbumNotFoundError, GalleryPhotoNotFoundError } from '../../errors/not-found.js';

const repo = {
    listAlbums: vi.fn(),
    findAlbum: vi.fn(),
    countAlbums: vi.fn(),
    createAlbum: vi.fn(),
    updateAlbum: vi.fn(),
    deleteAlbum: vi.fn(),
    reorderAlbums: vi.fn(),
    addPhoto: vi.fn(),
    findPhoto: vi.fn(),
    updatePhoto: vi.fn(),
    deletePhoto: vi.fn(),
    reorderPhotos: vi.fn(),
} as unknown as GalleryRepository;

const storage = {
    uploadFile: vi.fn(),
    getPublicUrl: vi.fn((_b: string, key: string) => `https://cdn/${key}`),
    deleteFile: vi.fn(),
} as unknown as StorageRepository;

const album = (photos: {
 id: string;
storageKey?: string 
}[] = []) =>
    ({ id: 'a1',
title: 'FAEP',
photos: photos.map((p, i) => ({ albumId: 'a1',
order: i,
storageKey: `k-${p.id}`,
...p })) }) as never;

describe('Galerias', () => {
    beforeEach(() => vi.clearAllMocks());

    it('cria no fim da lista, vazio vira null', async () => {
        vi.mocked(repo.countAlbums).mockResolvedValue(3);
        vi.mocked(repo.createAlbum).mockResolvedValue({ id: 'a9' } as never);
        const r = await new CreateGalleryUseCase(repo).execute({ title: ' Patrulha Rural ',
description: '',
linkUrl: '' });
        expect(r.error).toBeUndefined();
        expect(repo.createAlbum).toHaveBeenCalledWith({ title: 'Patrulha Rural',
description: null,
linkUrl: null,
order: 3 });
    });

    it.each([
        ['sem título', { title: '' }, 'título'],
        ['link sem protocolo', { title: 'FAEP',
linkUrl: 'faep.com.br' }, 'https://'],
    ])('rejeita %s', async (_n, input, trecho) => {
        const r = await new CreateGalleryUseCase(repo).execute(input);
        expect(r.error).toBeInstanceOf(ValidationError);
        expect(r.error?.message).toContain(trecho);
    });

    it('editar galeria inexistente é 404', async () => {
        vi.mocked(repo.findAlbum).mockResolvedValue(null);
        expect((await new UpdateGalleryUseCase(repo).execute('x', { isActive: false })).error).toBeInstanceOf(
            GalleryAlbumNotFoundError,
        );
    });

    it('excluir galeria apaga os arquivos das fotos', async () => {
        vi.mocked(repo.findAlbum).mockResolvedValue(album([{ id: 'p1' }, { id: 'p2' }]));
        await new DeleteGalleryUseCase(repo, storage).execute('a1');
        expect(repo.deleteAlbum).toHaveBeenCalledWith('a1');
        expect(storage.deleteFile).toHaveBeenCalledTimes(2);
    });

    it('reordenar exige todas as galerias, sem repetir', async () => {
        vi.mocked(repo.listAlbums).mockResolvedValue([{ id: 'a1' }, { id: 'a2' }] as never);
        const uc = new ReorderGalleriesUseCase(repo);
        expect((await uc.execute({ order: ['a1'] })).error).toBeInstanceOf(ValidationError);
        expect((await uc.execute({ order: ['a1', 'a1'] })).error).toBeInstanceOf(ValidationError);
        expect((await uc.execute({ order: ['a2', 'a1'] })).error).toBeUndefined();
        expect(repo.reorderAlbums).toHaveBeenCalledWith(['a2', 'a1']);
    });
});

describe('Fotos das galerias', () => {
    beforeEach(() => vi.clearAllMocks());

    it('reduz a foto para caber em 1600px, salva JPEG e põe no fim', async () => {
        const big = await sharp({ create: { width: 3200,
height: 1000,
channels: 3,
background: '#3a7' } }).png().toBuffer();
        vi.mocked(repo.findAlbum).mockResolvedValue(album([{ id: 'p1' }]));
        vi.mocked(repo.addPhoto).mockResolvedValue({ id: 'p2' } as never);

        const r = await new UploadGalleryPhotoUseCase(repo, storage).execute('a1', big, 'image/png');
        expect(r.error).toBeUndefined();

        const upload = vi.mocked(storage.uploadFile).mock.calls[0][0];
        expect(upload.contentType).toBe('image/jpeg');
        expect(upload.key).toMatch(/^galleries\/a1\/[0-9a-f-]{36}\.jpg$/);
        const meta = await sharp(upload.body as Buffer).metadata();
        expect([meta.format, meta.width, meta.height]).toEqual(['jpeg', 1600, 500]);
        expect(repo.addPhoto).toHaveBeenCalledWith(expect.objectContaining({ albumId: 'a1',
order: 1,
storageKey: upload.key }));
    });

    it('recusa formato não aceito e galeria cheia', async () => {
        const uc = new UploadGalleryPhotoUseCase(repo, storage);
        expect((await uc.execute('a1', Buffer.from('x'), 'application/pdf')).error?.message).toContain('Formato');

        const full = Array.from({ length: MAX_PHOTOS_PER_ALBUM }, (_, i) => ({ id: `p${i}` }));
        vi.mocked(repo.findAlbum).mockResolvedValue(album(full));
        const png = await sharp({ create: { width: 10,
height: 10,
channels: 3,
background: '#000' } }).png().toBuffer();
        expect((await uc.execute('a1', png, 'image/png')).error?.message).toContain('Limite');
        expect(storage.uploadFile).not.toHaveBeenCalled();
    });

    it('arquivo que diz ser imagem mas não é vira erro de validação', async () => {
        vi.mocked(repo.findAlbum).mockResolvedValue(album());
        const r = await new UploadGalleryPhotoUseCase(repo, storage).execute('a1', Buffer.from('não é imagem'), 'image/jpeg');
        expect(r.error).toBeInstanceOf(ValidationError);
        expect(storage.uploadFile).not.toHaveBeenCalled();
    });

    it('foto de outra galeria é 404 ao editar e excluir', async () => {
        vi.mocked(repo.findPhoto).mockResolvedValue({ id: 'p1',
albumId: 'outra' } as never);
        expect((await new UpdateGalleryPhotoUseCase(repo).execute('a1', 'p1', { caption: 'x' })).error).toBeInstanceOf(
            GalleryPhotoNotFoundError,
        );
        expect((await new DeleteGalleryPhotoUseCase(repo, storage).execute('a1', 'p1')).error).toBeInstanceOf(
            GalleryPhotoNotFoundError,
        );
        expect(repo.deletePhoto).not.toHaveBeenCalled();
    });

    it('legenda vazia vira null; excluir apaga o arquivo', async () => {
        vi.mocked(repo.findPhoto).mockResolvedValue({ id: 'p1',
albumId: 'a1',
storageKey: 'galleries/a1/x.jpg' } as never);
        await new UpdateGalleryPhotoUseCase(repo).execute('a1', 'p1', { caption: '  ' });
        expect(repo.updatePhoto).toHaveBeenCalledWith('p1', { caption: null });
        await new DeleteGalleryPhotoUseCase(repo, storage).execute('a1', 'p1');
        expect(storage.deleteFile).toHaveBeenCalledWith(expect.any(String), 'galleries/a1/x.jpg');
    });

    it('reordenar fotos exige todas as fotos da galeria', async () => {
        vi.mocked(repo.findAlbum).mockResolvedValue(album([{ id: 'p1' }, { id: 'p2' }]));
        const uc = new ReorderGalleryPhotosUseCase(repo);
        expect((await uc.execute('a1', { order: ['p1', 'p9'] })).error).toBeInstanceOf(ValidationError);
        expect((await uc.execute('a1', { order: ['p2', 'p1'] })).error).toBeUndefined();
        expect(repo.reorderPhotos).toHaveBeenCalledWith(['p2', 'p1']);
    });
});
