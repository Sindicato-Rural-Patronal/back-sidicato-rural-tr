import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListAllCoursesUseCase } from '../list-all-courses.js';
import type { CourseRepository } from '../../ports/external/course-repository.js';

const mockCourseRepo = {
    create: vi.fn(),
    findById: vi.fn(),
    findAll: vi.fn(),
    count: vi.fn().mockResolvedValue(0),
    update: vi.fn(),
    delete: vi.fn(),
    isRoomAvailable: vi.fn(),
    addPhoto: vi.fn(),
    deletePhoto: vi.fn(),
} as unknown as CourseRepository;

describe('ListAllCoursesUseCase', () => {
    beforeEach(() => vi.clearAllMocks());

    describe('listagem de cursos', () => {
        it('retorna todos os cursos sem filtro de status', async () => {
            vi.mocked(mockCourseRepo.findAll).mockResolvedValue([]);
            const uc = new ListAllCoursesUseCase(mockCourseRepo);
            await uc.execute();
            expect(mockCourseRepo.findAll).toHaveBeenCalledWith(undefined, 0, 20);
        });

        it('retorna lista vazia quando não há cursos', async () => {
            vi.mocked(mockCourseRepo.findAll).mockResolvedValue([]);
            const uc = new ListAllCoursesUseCase(mockCourseRepo);
            const result = await uc.execute();
            expect(result.error).toBeUndefined();
            expect(result.result?.data).toHaveLength(0);
        });
    });
});
