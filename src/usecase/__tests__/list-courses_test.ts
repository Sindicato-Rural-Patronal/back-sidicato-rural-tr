import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListCoursesUseCase } from '../list-courses.js';
import type { CourseRepository } from '../../ports/external/course-repository.js';
import { CourseStatus } from '../../ports/external/course-repository.js';

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

const baseCourse = {
    id: 'c1',
    name: 'Curso Teste',
    description: 'Desc',
    status: CourseStatus.PUBLICO,
    price: 0,
    workloadHours: 0,
    bannerUrl: null,
    minStudents: 0,
    preEnrolled: 0,
    waitlist: 0,
    startTime: new Date('2026-07-01T08:00:00Z'),
    endTime: new Date('2026-07-01T12:00:00Z'),
    registrationDeadline: null,
    observations: null,
    eventNumber: null,
    room: { name: 'Sala A', maxCapacity: 20 },
    photos: [],
    _count: { courseUserRegistration: 0 },
    Instructors: [],
};

describe('ListCoursesUseCase', () => {
    beforeEach(() => vi.clearAllMocks());

    describe('filtro de visibilidade', () => {
        it('filtra apenas cursos PUBLICO por padrão', async () => {
            vi.mocked(mockCourseRepo.findAll).mockResolvedValue([baseCourse as any]);
            const uc = new ListCoursesUseCase(mockCourseRepo);
            await uc.execute();
            expect(mockCourseRepo.findAll).toHaveBeenCalledWith(CourseStatus.PUBLICO, 0, 20);
        });

        it('busca todos os cursos quando onlyPublic=false', async () => {
            vi.mocked(mockCourseRepo.findAll).mockResolvedValue([baseCourse as any]);
            const uc = new ListCoursesUseCase(mockCourseRepo);
            await uc.execute(false);
            expect(mockCourseRepo.findAll).toHaveBeenCalledWith(undefined, 0, 20);
        });

        it('retorna lista mapeada para formato frontend', async () => {
            vi.mocked(mockCourseRepo.findAll).mockResolvedValue([baseCourse as any]);
            const uc = new ListCoursesUseCase(mockCourseRepo);
            const result = await uc.execute();
            expect(result.success).toBe(true);
            expect(result.result?.data).toHaveLength(1);
            expect(result.result?.data?.[0].title).toBe('Curso Teste');
        });

        it('retorna lista vazia quando não há cursos', async () => {
            vi.mocked(mockCourseRepo.findAll).mockResolvedValue([]);
            const uc = new ListCoursesUseCase(mockCourseRepo);
            const result = await uc.execute();
            expect(result.result?.data).toHaveLength(0);
        });
    });
});
