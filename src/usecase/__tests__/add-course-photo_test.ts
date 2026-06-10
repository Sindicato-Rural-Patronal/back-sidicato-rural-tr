import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AddCoursePhotoUseCase } from '../add-course-photo.js';
import type { CourseRepository } from '../../ports/external/course-repository.js';
import type { StorageRepository } from '../../ports/external/storage-repository.js';

const mockCourseRepo = {
    create: vi.fn(),
    findById: vi.fn(),
    findAll: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    isRoomAvailable: vi.fn(),
    addPhoto: vi.fn(),
    deletePhoto: vi.fn(),
} as unknown as CourseRepository;

const mockStorage = {
    uploadFile: vi.fn(),
    getPublicUrl: vi.fn(),
    deleteFile: vi.fn(),
} as unknown as StorageRepository;

const fakeBuffer = Buffer.from('fake-image');

describe('AddCoursePhotoUseCase', () => {
    beforeEach(() => vi.clearAllMocks());

    describe('verificação do curso', () => {
        it('falha se curso não existir', async () => {
            vi.mocked(mockCourseRepo.findById).mockResolvedValue(null);
            const uc = new AddCoursePhotoUseCase(mockCourseRepo, mockStorage);
            const result = await uc.execute('course-inexistente', fakeBuffer, 'foto.jpg');
            expect(result.error).toBeDefined();
            expect(result.error?.message).toBe('Course not found');
        });
    });

    describe('upload bem-sucedido', () => {
        it('faz upload e retorna url e photoId', async () => {
            vi.mocked(mockCourseRepo.findById).mockResolvedValue({ id: 'course-001' } as any);
            vi.mocked(mockStorage.uploadFile).mockResolvedValue({
                location: 'http://bucket/foto.jpg',
                key: 'foto.jpg',
                bucket: 'test-bucket',
            });
            vi.mocked(mockStorage.getPublicUrl).mockReturnValue('http://bucket/foto.jpg');
            vi.mocked(mockCourseRepo.addPhoto).mockResolvedValue({ id: 'photo-001' } as any);
            const uc = new AddCoursePhotoUseCase(mockCourseRepo, mockStorage);
            const result = await uc.execute('course-001', fakeBuffer, 'foto.jpg', 'Legenda');
            expect(result.error).toBeUndefined();
            expect(result.url).toBe('http://bucket/foto.jpg');
            expect(result.photoId).toBe('photo-001');
        });
    });
});
