import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { z } from 'zod';
import type {
    GalleryRepository,
    GalleryAlbumModel,
    GalleryAlbumWithPhotos,
    GalleryPhotoModel,
} from '../ports/external/gallery-repository.js';
import type { StorageRepository } from '../ports/external/storage-repository.js';
import { ValidationError } from '../errors/validation.js';
import { GalleryAlbumNotFoundError, GalleryPhotoNotFoundError } from '../errors/not-found.js';
import { validateImageUpload } from '../lib/image-upload.js';
import { buckets } from '../lib/buckets.js';

// Galerias de imagens da home (História do Sindicato, FAEP, Patrulha Rural…).
// Casos de uso finos no mesmo arquivo, como os de convênios e empresas.

type Result<T> = { error?: Error } & T;

// Mesmo bucket público dos banners, em pasta própria.
const PHOTO_BUCKET = buckets.courseBanners;
const PHOTO_MAX_SIDE = 1600;
export const MAX_PHOTOS_PER_ALBUM = 60;

const emptyToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);

export const galleryAlbumSchema = z.object({
    title: z.string().trim().min(1, 'Informe o título da galeria').max(120, 'Título muito longo'),
    description: z.preprocess(emptyToNull, z.string().trim().max(500, 'Descrição muito longa').nullable().optional()),
    linkUrl: z.preprocess(
        emptyToNull,
        z.string().trim().url('Link inválido: comece com https://').max(500).nullable().optional(),
    ),
    isActive: z.boolean().optional(),
});

const reorderSchema = z.object({
    order: z.array(z.string().trim().min(1).max(64)).min(1, 'Informe a ordem'),
});

const photoUpdateSchema = z.object({
    caption: z.preprocess(emptyToNull, z.string().trim().max(200, 'Legenda muito longa').nullable()),
});

function firstIssue(error: z.ZodError): string {
    return error.issues[0]?.message ?? 'Dados inválidos';
}

async function removeFiles(storage: StorageRepository, keys: string[]) {
    // Melhor esforço: o registro já saiu do banco; arquivo órfão não quebra nada.
    await Promise.allSettled(keys.map(key => storage.deleteFile(PHOTO_BUCKET, key)));
}

export class ListGalleriesUseCase {
    constructor(private readonly repo: GalleryRepository) {}
    execute(publicOnly: boolean): Promise<GalleryAlbumWithPhotos[]> {
        return this.repo.listAlbums(publicOnly);
    }
}

export class CreateGalleryUseCase {
    constructor(private readonly repo: GalleryRepository) {}
    async execute(input: unknown): Promise<Result<{ album?: GalleryAlbumModel }>> {
        const parsed = galleryAlbumSchema.safeParse(input);
        if (!parsed.success) return { error: new ValidationError(firstIssue(parsed.error)) };
        // Nova galeria entra no fim da lista.
        const album = await this.repo.createAlbum({ ...parsed.data,
order: await this.repo.countAlbums() });
        return { album };
    }
}

export class UpdateGalleryUseCase {
    constructor(private readonly repo: GalleryRepository) {}
    async execute(id: string, input: unknown): Promise<Result<{ album?: GalleryAlbumModel }>> {
        const parsed = galleryAlbumSchema.partial().safeParse(input);
        if (!parsed.success) return { error: new ValidationError(firstIssue(parsed.error)) };
        if (!(await this.repo.findAlbum(id))) return { error: new GalleryAlbumNotFoundError() };
        const album = await this.repo.updateAlbum(id, parsed.data);
        return { album };
    }
}

export class DeleteGalleryUseCase {
    constructor(
        private readonly repo: GalleryRepository,
        private readonly storage: StorageRepository,
    ) {}
    async execute(id: string): Promise<Result<object>> {
        const album = await this.repo.findAlbum(id);
        if (!album) return { error: new GalleryAlbumNotFoundError() };
        await this.repo.deleteAlbum(id);
        await removeFiles(this.storage, album.photos.map(p => p.storageKey));
        return {};
    }
}

export class ReorderGalleriesUseCase {
    constructor(private readonly repo: GalleryRepository) {}
    async execute(input: unknown): Promise<Result<object>> {
        const parsed = reorderSchema.safeParse(input);
        if (!parsed.success) return { error: new ValidationError(firstIssue(parsed.error)) };
        const all = await this.repo.listAlbums(false);
        const ids = new Set(all.map(a => a.id));
        const order = parsed.data.order;
        if (order.length !== ids.size || new Set(order).size !== order.length || !order.every(id => ids.has(id))) {
            return { error: new ValidationError('A ordem precisa conter todas as galerias, uma vez cada') };
        }
        await this.repo.reorderAlbums(order);
        return {};
    }
}

// ── Fotos ────────────────────────────────────────────────────────────────────

export class UploadGalleryPhotoUseCase {
    constructor(
        private readonly repo: GalleryRepository,
        private readonly storage: StorageRepository,
    ) {}
    async execute(albumId: string, fileBuffer: Buffer, mimeType: string): Promise<Result<{ photo?: GalleryPhotoModel }>> {
        const invalid = validateImageUpload(fileBuffer, mimeType);
        if (invalid) return { error: new ValidationError(invalid) };

        const album = await this.repo.findAlbum(albumId);
        if (!album) return { error: new GalleryAlbumNotFoundError() };
        if (album.photos.length >= MAX_PHOTOS_PER_ALBUM) {
            return { error: new ValidationError(`Limite de ${MAX_PHOTOS_PER_ALBUM} fotos por galeria`) };
        }

        // Endireita pela orientação da câmera (EXIF) e reduz para caber em
        // 1600×1600 — foto de celular chega a 5MB+, na home não precisa disso.
        let processed: Buffer;
        try {
            processed = await sharp(fileBuffer)
                .rotate()
                .resize(PHOTO_MAX_SIDE, PHOTO_MAX_SIDE, { fit: 'inside',
withoutEnlargement: true })
                .jpeg({ quality: 82,
mozjpeg: true })
                .toBuffer();
        } catch {
            return { error: new ValidationError('Não foi possível ler a imagem. Envie outro arquivo.') };
        }

        const storageKey = `galleries/${albumId}/${randomUUID()}.jpg`;
        await this.storage.uploadFile({ bucket: PHOTO_BUCKET,
key: storageKey,
body: processed,
contentType: 'image/jpeg' });
        const photo = await this.repo.addPhoto({
            albumId,
            url: this.storage.getPublicUrl(PHOTO_BUCKET, storageKey),
            storageKey,
            order: album.photos.length,
        });
        return { photo };
    }
}

export class UpdateGalleryPhotoUseCase {
    constructor(private readonly repo: GalleryRepository) {}
    async execute(albumId: string, photoId: string, input: unknown): Promise<Result<{ photo?: GalleryPhotoModel }>> {
        const parsed = photoUpdateSchema.safeParse(input);
        if (!parsed.success) return { error: new ValidationError(firstIssue(parsed.error)) };
        const existing = await this.repo.findPhoto(photoId);
        if (!existing || existing.albumId !== albumId) return { error: new GalleryPhotoNotFoundError() };
        const photo = await this.repo.updatePhoto(photoId, { caption: parsed.data.caption ?? null });
        return { photo };
    }
}

export class DeleteGalleryPhotoUseCase {
    constructor(
        private readonly repo: GalleryRepository,
        private readonly storage: StorageRepository,
    ) {}
    async execute(albumId: string, photoId: string): Promise<Result<object>> {
        const existing = await this.repo.findPhoto(photoId);
        if (!existing || existing.albumId !== albumId) return { error: new GalleryPhotoNotFoundError() };
        await this.repo.deletePhoto(photoId);
        await removeFiles(this.storage, [existing.storageKey]);
        return {};
    }
}

export class ReorderGalleryPhotosUseCase {
    constructor(private readonly repo: GalleryRepository) {}
    async execute(albumId: string, input: unknown): Promise<Result<object>> {
        const parsed = reorderSchema.safeParse(input);
        if (!parsed.success) return { error: new ValidationError(firstIssue(parsed.error)) };
        const album = await this.repo.findAlbum(albumId);
        if (!album) return { error: new GalleryAlbumNotFoundError() };
        const ids = new Set(album.photos.map(p => p.id));
        const order = parsed.data.order;
        if (order.length !== ids.size || new Set(order).size !== order.length || !order.every(id => ids.has(id))) {
            return { error: new ValidationError('A ordem precisa conter todas as fotos da galeria, uma vez cada') };
        }
        await this.repo.reorderPhotos(order);
        return {};
    }
}
