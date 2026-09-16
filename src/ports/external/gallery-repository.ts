import type { GalleryAlbumModel } from '../../generated/prisma/models/GalleryAlbum.js';
import type { GalleryPhotoModel } from '../../generated/prisma/models/GalleryPhoto.js';

export type { GalleryAlbumModel, GalleryPhotoModel };

export type GalleryAlbumWithPhotos = GalleryAlbumModel & { photos: GalleryPhotoModel[] };

export type GalleryAlbumInput = {
    title: string;
    description?: string | null;
    linkUrl?: string | null;
    isActive?: boolean;
};

export interface GalleryRepository {
    /** Galerias com fotos, em ordem. `publicOnly` = ativas e com pelo menos uma foto. */
    listAlbums(publicOnly: boolean): Promise<GalleryAlbumWithPhotos[]>;
    findAlbum(id: string): Promise<GalleryAlbumWithPhotos | null>;
    countAlbums(): Promise<number>;
    createAlbum(data: GalleryAlbumInput & { order: number }): Promise<GalleryAlbumModel>;
    updateAlbum(id: string, data: Partial<GalleryAlbumInput>): Promise<GalleryAlbumModel>;
    deleteAlbum(id: string): Promise<void>;
    reorderAlbums(ids: string[]): Promise<void>;

    addPhoto(data: {
        albumId: string;
        url: string;
        storageKey: string;
        order: number;
    }): Promise<GalleryPhotoModel>;
    findPhoto(id: string): Promise<GalleryPhotoModel | null>;
    updatePhoto(id: string, data: { caption: string | null }): Promise<GalleryPhotoModel>;
    deletePhoto(id: string): Promise<void>;
    reorderPhotos(ids: string[]): Promise<void>;
}
