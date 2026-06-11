import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetCourseDetailUseCase } from '../get-course-detail.js';
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

const fakeCourse = {
    id: 'course-001',
    name: 'Curso de NR-10',
    description: 'Segurança elétrica',
    status: 'PUBLIC',
    price: 100,
    workloadHours: 40,
    bannerUrl: null,
    minStudents: 5,
    preEnrolled: 0,
    waitlist: 0,
    startTime: new Date('2026-07-01T08:00:00Z'),
    endTime: new Date('2026-07-01T12:00:00Z'),
    registrationDeadline: null,
    observations: null,
    eventNumber: null,
    room: { name: 'Sala A',
maxCapacity: 30 },
    photos: [],
    _count: { courseUserRegistration: 10 },
    instructors: [{ userData: { name: 'Prof. João' } }],
};

describe('GetCourseDetailUseCase', () => {
    beforeEach(() => vi.clearAllMocks());

    describe('busca de curso', () => {
        it('falha se curso não existir', async () => {
            vi.mocked(mockCourseRepo.findById).mockResolvedValue(null);
            const uc = new GetCourseDetailUseCase(mockCourseRepo);
            const result = await uc.execute('course-inexistente');
            expect(result.error).toBeDefined();
            expect(result.error?.message).toBe('Course not found');
        });
    });

    describe('mapeamento para frontend', () => {
        it('mapeia campos corretamente ao encontrar curso', async () => {
            vi.mocked(mockCourseRepo.findById).mockResolvedValue(fakeCourse as any);
            const uc = new GetCourseDetailUseCase(mockCourseRepo);
            const result = await uc.execute('course-001');
            expect(result.error).toBeUndefined();
            expect(result.course?.title).toBe('Curso de NR-10');
            expect(result.course?.location).toBe('Sala A');
            expect(result.course?.maxStudents).toBe(30);
            expect(result.course?.enrolled).toBe(10);
        });

        it('retorna instructor vazio se curso não tiver instrutor', async () => {
            const noInstructor = { ...fakeCourse,
instructors: [] };
            vi.mocked(mockCourseRepo.findById).mockResolvedValue(noInstructor as any);
            const uc = new GetCourseDetailUseCase(mockCourseRepo);
            const result = await uc.execute('course-001');
            expect(result.course?.instructorName).toBe('');
        });

        it('mapeia galeria de fotos corretamente', async () => {
            const withPhoto = {
                ...fakeCourse,
                photos: [{ id: 'p1',
url: 'http://img.com/1.jpg',
caption: 'Foto 1' }],
            };
            vi.mocked(mockCourseRepo.findById).mockResolvedValue(withPhoto as any);
            const uc = new GetCourseDetailUseCase(mockCourseRepo);
            const result = await uc.execute('course-001');
            expect(result.course?.photoGallery).toHaveLength(1);
            expect(result.course?.photoGallery[0].caption).toBe('Foto 1');
        });

        it('usa string vazia como caption quando foto não tem legenda', async () => {
            const withPhoto = {
                ...fakeCourse,
                photos: [{ id: 'p2',
url: 'http://img.com/2.jpg',
caption: null }],
            };
            vi.mocked(mockCourseRepo.findById).mockResolvedValue(withPhoto as any);
            const uc = new GetCourseDetailUseCase(mockCourseRepo);
            const result = await uc.execute('course-001');
            expect(result.course?.photoGallery[0].caption).toBe('');
        });
    });
});
