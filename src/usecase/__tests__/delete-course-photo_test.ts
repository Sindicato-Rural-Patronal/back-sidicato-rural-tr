import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeleteCoursePhotoUseCase } from '../delete-course-photo.js';
import type { CourseRepository } from '../../ports/external/course-repository.js';

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

describe('DeleteCoursePhotoUseCase', () => {
    beforeEach(() => vi.clearAllMocks());

    describe('verificação da foto', () => {
        it('falha se foto não existir', async () => {
            vi.mocked(mockCourseRepo.deletePhoto).mockResolvedValue(false);
            const uc = new DeleteCoursePhotoUseCase(mockCourseRepo);
            const result = await uc.execute('photo-inexistente');
            expect(result.error).toBeDefined();
            expect(result.error?.message).toBe('Photo not found');
        });
    });

    describe('deleção bem-sucedida', () => {
        it('retorna success true ao deletar foto válida', async () => {
            vi.mocked(mockCourseRepo.deletePhoto).mockResolvedValue(true);
            const uc = new DeleteCoursePhotoUseCase(mockCourseRepo);
            const result = await uc.execute('photo-001');
            expect(result.error).toBeUndefined();
        });
    });
});
