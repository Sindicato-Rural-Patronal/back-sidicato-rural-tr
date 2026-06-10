import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeleteCourseUseCase } from '../delete-course.js';
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

describe('DeleteCourseUseCase', () => {
    beforeEach(() => vi.clearAllMocks());

    describe('verificação do curso', () => {
        it('falha se curso não existir', async () => {
            vi.mocked(mockCourseRepo.findById).mockResolvedValue(null);
            const uc = new DeleteCourseUseCase(mockCourseRepo);
            const result = await uc.execute('course-inexistente');
            expect(result.error).toBeDefined();
            expect(result.error?.message).toBe('Course not found');
        });

        it('falha se deleção retornar false', async () => {
            vi.mocked(mockCourseRepo.findById).mockResolvedValue({ id: 'course-001' } as any);
            vi.mocked(mockCourseRepo.delete).mockResolvedValue(false);
            const uc = new DeleteCourseUseCase(mockCourseRepo);
            const result = await uc.execute('course-001');
            expect(result.error).toBeDefined();
            expect(result.error?.message).toBe('Failed to delete course');
        });
    });

    describe('deleção bem-sucedida', () => {
        it('retorna success true ao deletar curso válido', async () => {
            vi.mocked(mockCourseRepo.findById).mockResolvedValue({ id: 'course-001' } as any);
            vi.mocked(mockCourseRepo.delete).mockResolvedValue(true);
            const uc = new DeleteCourseUseCase(mockCourseRepo);
            const result = await uc.execute('course-001');
            expect(result.error).toBeUndefined();
        });
    });
});
