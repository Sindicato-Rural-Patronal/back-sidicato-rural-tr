import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DashboardStatsUseCase } from '../dashboard-stats.js';
import { CourseStatus } from '../../ports/external/course-repository.js';
import type { CourseRepository } from '../../ports/external/course-repository.js';
import type { UserDataRepository } from '../../ports/external/user-data-repository.js';
import type { UserAdminRepository } from '../../ports/external/user-admin-repository.js';

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

const mockUserDataRepo = {
    create: vi.fn(),
    findById: vi.fn(),
    findByEmailOurPhone: vi.fn(),
    findByEmailOrCpf: vi.fn(),
    findAll: vi.fn(),
} as unknown as UserDataRepository;

const mockUserAdminRepo = {
    create: vi.fn(),
    findById: vi.fn(),
    findByUsername: vi.fn(),
    findByUserDataId: vi.fn(),
    findAll: vi.fn(),
} as unknown as UserAdminRepository;

function makeCourse(status: CourseStatus, registrations: number) {
    return {
        id: `c-${Math.random()}`,
        status,
        _count: { courseUserRegistration: registrations },
        room: { name: 'Sala',
maxCapacity: 30 },
        photos: [],
        Instructors: [],
        name: 'X',
        description: 'X',
        price: 0,
        workloadHours: 0,
        bannerUrl: null,
        minStudents: 0,
        preEnrolled: 0,
        waitlist: 0,
        startTime: new Date(),
        endTime: new Date(),
        registrationDeadline: null,
        observations: null,
        eventNumber: null,
    };
}

describe('DashboardStatsUseCase', () => {
    beforeEach(() => vi.clearAllMocks());

    describe('cálculo de estatísticas', () => {
        it('conta usuários e admins corretamente', async () => {
            vi.mocked(mockUserDataRepo.findAll).mockResolvedValue([
                {} as any,
                {} as any,
                {} as any,
            ]);
            vi.mocked(mockUserAdminRepo.findAll).mockResolvedValue([{} as any]);
            vi.mocked(mockCourseRepo.findAll).mockResolvedValue([]);
            const uc = new DashboardStatsUseCase(
                mockCourseRepo,
                mockUserDataRepo,
                mockUserAdminRepo,
            );
            const result = await uc.execute();
            expect(result.stats?.totalUsers).toBe(3);
            expect(result.stats?.totalAdmins).toBe(1);
        });

        it('agrupa cursos por status corretamente', async () => {
            const courses = [
                makeCourse(CourseStatus.PUBLICO, 5),
                makeCourse(CourseStatus.PUBLICO, 3),
                makeCourse(CourseStatus.PRIVADO, 2),
                makeCourse(CourseStatus.NAO_PUBLICADO, 0),
            ];
            vi.mocked(mockUserDataRepo.findAll).mockResolvedValue([]);
            vi.mocked(mockUserAdminRepo.findAll).mockResolvedValue([]);
            vi.mocked(mockCourseRepo.findAll).mockResolvedValue(courses as any);
            const uc = new DashboardStatsUseCase(
                mockCourseRepo,
                mockUserDataRepo,
                mockUserAdminRepo,
            );
            const result = await uc.execute();
            expect(result.stats?.courses.total).toBe(4);
            expect(result.stats?.courses.public).toBe(2);
            expect(result.stats?.courses.private).toBe(1);
            expect(result.stats?.courses.unpublished).toBe(1);
        });

        it('soma total de inscrições em todos os cursos', async () => {
            const courses = [
                makeCourse(CourseStatus.PUBLICO, 10),
                makeCourse(CourseStatus.PUBLICO, 7),
                makeCourse(CourseStatus.PRIVADO, 3),
            ];
            vi.mocked(mockUserDataRepo.findAll).mockResolvedValue([]);
            vi.mocked(mockUserAdminRepo.findAll).mockResolvedValue([]);
            vi.mocked(mockCourseRepo.findAll).mockResolvedValue(courses as any);
            const uc = new DashboardStatsUseCase(
                mockCourseRepo,
                mockUserDataRepo,
                mockUserAdminRepo,
            );
            const result = await uc.execute();
            expect(result.stats?.totalRegistrations).toBe(20);
        });
    });
});
