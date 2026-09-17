import { describe, it, expect, vi, beforeEach } from 'vitest';
import sharp from 'sharp';
import { UploadCourseBannerUseCase, THUMB_WIDTH, THUMB_HEIGHT } from '../upload-banner-course.js';
import { mapToCard } from '../list-all-courses.js';
import { mapToFrontend } from '../get-course-detail.js';
import type { CourseRepository, CourseWithDetails } from '../../ports/external/course-repository.js';
import type { StorageRepository } from '../../ports/external/storage-repository.js';
import { CourseNotFoundError } from '../../errors/not-found.js';

const repo = {
    findById: vi.fn(),
    update: vi.fn(),
} as unknown as CourseRepository;

const storage = {
    uploadFile: vi.fn(),
    getPublicUrl: vi.fn((bucket: string, key: string) => `https://cdn.test/${bucket}/${key}`),
    deleteFile: vi.fn(),
} as unknown as StorageRepository;

const course = {
    id: 'c1',
    name: 'Curso',
    description: 'Descrição',
    status: 'PUBLIC',
    price: 0,
    workloadHours: 8,
    bannerUrl: null,
    bannerThumbUrl: null,
    minStudents: 0,
    preEnrolled: 0,
    waitlist: 0,
    eventNumber: null,
    registrationDeadline: null,
    observations: null,
    startTime: new Date('2026-10-01T08:00:00Z'),
    endTime: new Date('2026-10-01T12:00:00Z'),
    room: { name: 'SALA 1',
maxCapacity: 20 },
    photos: [],
    _count: { courseUserRegistration: 0 },
    instructors: [],
} as unknown as CourseWithDetails;

async function image(width: number, height: number) {
    return sharp({ create: { width,
height,
channels: 3,
background: '#3a7' } }).png().toBuffer();
}

describe('UploadCourseBannerUseCase', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(repo.findById).mockResolvedValue(course);
        vi.mocked(storage.uploadFile).mockResolvedValue({ location: '',
key: '',
bucket: '' });
    });

    it('salva a capa em JPEG 1920×1080 e a miniatura em WebP 640×360', async () => {
        const r = await new UploadCourseBannerUseCase(storage, repo).execute('c1', await image(2400, 1600), 'image/png');
        expect(r.error).toBeUndefined();

        const [full, thumb] = vi.mocked(storage.uploadFile).mock.calls.map(c => c[0]);
        expect(full.key).toBe('courses/c1/banner.jpg');
        expect(thumb.key).toBe('courses/c1/banner-thumb.webp');
        expect(thumb.contentType).toBe('image/webp');

        const fullMeta = await sharp(full.body as Buffer).metadata();
        expect([fullMeta.format, fullMeta.width, fullMeta.height]).toEqual(['jpeg', 1920, 1080]);
        const thumbMeta = await sharp(thumb.body as Buffer).metadata();
        expect([thumbMeta.format, thumbMeta.width, thumbMeta.height]).toEqual(['webp', THUMB_WIDTH, THUMB_HEIGHT]);

        expect(r.url).toMatch(/^https:\/\/cdn\.test\/.+\/courses\/c1\/banner\.jpg\?t=\d+$/);
        expect(r.thumbUrl).toMatch(/^https:\/\/cdn\.test\/.+\/courses\/c1\/banner-thumb\.webp\?t=\d+$/);
        // Capa e miniatura são gravadas juntas: trocar a capa troca a miniatura.
        expect(repo.update).toHaveBeenCalledWith('c1', { bannerUrl: r.url,
bannerThumbUrl: r.thumbUrl });
    });

    it('se a miniatura falhar, troca a capa mesmo assim e zera a miniatura antiga', async () => {
        vi.mocked(storage.uploadFile)
            .mockResolvedValueOnce({ location: '',
key: '',
bucket: '' })
            .mockRejectedValueOnce(new Error('storage fora'));

        const r = await new UploadCourseBannerUseCase(storage, repo).execute('c1', await image(800, 600), 'image/png');
        expect(r.error).toBeUndefined();
        expect(r.thumbUrl).toBeNull();
        expect(repo.update).toHaveBeenCalledWith('c1', { bannerUrl: r.url,
bannerThumbUrl: null });
    });

    it('recusa formato inválido e curso inexistente sem enviar nada', async () => {
        const uc = new UploadCourseBannerUseCase(storage, repo);
        expect((await uc.execute('c1', Buffer.from('x'), 'application/pdf')).error?.message).toContain('Formato');

        vi.mocked(repo.findById).mockResolvedValue(null);
        expect((await uc.execute('zz', await image(10, 10), 'image/png')).error).toBeInstanceOf(CourseNotFoundError);
        expect(storage.uploadFile).not.toHaveBeenCalled();
        expect(repo.update).not.toHaveBeenCalled();
    });
});

describe('miniatura nas listagens de cursos', () => {
    it('card do painel e lista pública devolvem coverImageThumb (null nos cursos antigos)', () => {
        const withThumb = { ...course,
bannerUrl: 'https://cdn.test/full.jpg',
bannerThumbUrl: 'https://cdn.test/thumb.webp' } as CourseWithDetails;
        expect(mapToCard(withThumb)).toMatchObject({ coverImage: 'https://cdn.test/full.jpg',
coverImageThumb: 'https://cdn.test/thumb.webp' });
        expect(mapToFrontend(withThumb)).toMatchObject({ coverImage: 'https://cdn.test/full.jpg',
coverImageThumb: 'https://cdn.test/thumb.webp' });

        expect(mapToCard(course).coverImageThumb).toBeNull();
        expect(mapToFrontend(course).coverImageThumb).toBeNull();
    });
});
