import type { PrismaClient } from '@prisma/client/extension';
import type {
    GalleryRepository,
    GalleryAlbumModel,
    GalleryAlbumWithPhotos,
    GalleryAlbumInput,
    GalleryPhotoModel,
} from '../../ports/external/gallery-repository.js';

export function createGalleryAdapter(prisma: PrismaClient): GalleryRepository {
    return new GalleryAdapter(prisma);
}

const photosInOrder = { orderBy: [{ order: 'asc' },
{ createdAt: 'asc' }] } as const;

class GalleryAdapter implements GalleryRepository {
    constructor(private prisma: PrismaClient) {}

    listAlbums(publicOnly: boolean): Promise<GalleryAlbumWithPhotos[]> {
        return this.prisma.galleryAlbum.findMany({
            where: publicOnly ? { isActive: true,
photos: { some: {} } } : {},
            include: { photos: photosInOrder },
            orderBy: [{ order: 'asc' },
{ createdAt: 'asc' }],
        });
    }

    findAlbum(id: string): Promise<GalleryAlbumWithPhotos | null> {
        return this.prisma.galleryAlbum.findUnique({ where: { id },
include: { photos: photosInOrder } });
    }

    countAlbums(): Promise<number> {
        return this.prisma.galleryAlbum.count();
    }

    createAlbum(data: GalleryAlbumInput & { order: number }): Promise<GalleryAlbumModel> {
        return this.prisma.galleryAlbum.create({ data });
    }

    updateAlbum(id: string, data: Partial<GalleryAlbumInput>): Promise<GalleryAlbumModel> {
        return this.prisma.galleryAlbum.update({ where: { id },
data });
    }

    async deleteAlbum(id: string): Promise<void> {
        await this.prisma.galleryAlbum.delete({ where: { id } });
    }

    async reorderAlbums(ids: string[]): Promise<void> {
        await this.prisma.$transaction(
            ids.map((id, order) => this.prisma.galleryAlbum.update({ where: { id },
data: { order } })),
        );
    }

    addPhoto(data: {
 albumId: string;
url: string;
storageKey: string;
order: number 
}): Promise<GalleryPhotoModel> {
        return this.prisma.galleryPhoto.create({ data });
    }

    findPhoto(id: string): Promise<GalleryPhotoModel | null> {
        return this.prisma.galleryPhoto.findUnique({ where: { id } });
    }

    updatePhoto(id: string, data: { caption: string | null }): Promise<GalleryPhotoModel> {
        return this.prisma.galleryPhoto.update({ where: { id },
data });
    }

    async deletePhoto(id: string): Promise<void> {
        await this.prisma.galleryPhoto.delete({ where: { id } });
    }

    async reorderPhotos(ids: string[]): Promise<void> {
        await this.prisma.$transaction(
            ids.map((id, order) => this.prisma.galleryPhoto.update({ where: { id },
data: { order } })),
        );
    }
}
