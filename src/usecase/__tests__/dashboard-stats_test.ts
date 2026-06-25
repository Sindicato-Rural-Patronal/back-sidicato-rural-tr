import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DashboardStatsUseCase } from '../dashboard-stats.js';
import { CourseStatus } from '../../ports/external/course-repository.js';
import type { CourseRepository } from '../../ports/external/course-repository.js';
import type { UserDataRepository } from '../../ports/external/user-data-repository.js';
import type { UserAdminRepository } from '../../ports/external/user-admin-repository.js';
import type { RegistrationRepository } from '../../ports/external/registration-repository.js';

const mockCourseRepo = {
    create: vi.fn(),
    findById: vi.fn(),
    findAll: vi.fn(),
    count: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    isRoomAvailable: vi.fn(),
    addPhoto: vi.fn(),
    deletePhoto: vi.fn(),
} as unknown as CourseRepository;

const mockUserDataRepo = {
    create: vi.fn(),
    findById: vi.fn(),
    findByCpf: vi.fn(),
    findByRg: vi.fn(),
    findByEmailOrCpf: vi.fn(),
    findAll: vi.fn(),
    count: vi.fn(),
} as unknown as UserDataRepository;

const mockUserAdminRepo = {
    create: vi.fn(),
    findById: vi.fn(),
    findByUsername: vi.fn(),
    findByUserDataId: vi.fn(),
    findAll: vi.fn(),
    count: vi.fn(),
} as unknown as UserAdminRepository;

const mockRegistrationRepo = {
    create: vi.fn(),
    findById: vi.fn(),
    findByCourseId: vi.fn(),
    findByUserDataAndCourse: vi.fn(),
    count: vi.fn(),
    delete: vi.fn(),
} as unknown as RegistrationRepository;

function makeUseCase() {
    return new DashboardStatsUseCase(
        mockCourseRepo,
        mockUserDataRepo,
        mockUserAdminRepo,
        mockRegistrationRepo,
    );
}

describe('DashboardStatsUseCase', () => {
    beforeEach(() => vi.clearAllMocks());

    describe('cálculo de estatísticas', () => {
        it('conta usuários e admins corretamente', async () => {
            vi.mocked(mockUserDataRepo.count).mockResolvedValue(3);
            vi.mocked(mockUserAdminRepo.count).mockResolvedValue(1);
            vi.mocked(mockCourseRepo.count).mockResolvedValue(0);
            vi.mocked(mockRegistrationRepo.count).mockResolvedValue(0);
            const result = await makeUseCase().execute();
            expect(result.stats?.totalUsers).toBe(3);
            expect(result.stats?.totalAdmins).toBe(1);
        });

        it('agrupa cursos por status corretamente', async () => {
            vi.mocked(mockUserDataRepo.count).mockResolvedValue(0);
            vi.mocked(mockUserAdminRepo.count).mockResolvedValue(0);
            vi.mocked(mockCourseRepo.count).mockImplementation((filters?) => {
                if (!filters?.status) return Promise.resolve(4);
                if (filters.status === CourseStatus.PUBLIC) return Promise.resolve(2);
                if (filters.status === CourseStatus.PRIVATE) return Promise.resolve(1);
                if (filters.status === CourseStatus.UNPUBLISHED) return Promise.resolve(1);
                return Promise.resolve(0);
            });
            vi.mocked(mockRegistrationRepo.count).mockResolvedValue(0);
            const result = await makeUseCase().execute();
            expect(result.stats?.courses.total).toBe(4);
            expect(result.stats?.courses.public).toBe(2);
            expect(result.stats?.courses.private).toBe(1);
            expect(result.stats?.courses.unpublished).toBe(1);
        });

        it('soma total de inscrições via registrationRepository.count()', async () => {
            vi.mocked(mockUserDataRepo.count).mockResolvedValue(0);
            vi.mocked(mockUserAdminRepo.count).mockResolvedValue(0);
            vi.mocked(mockCourseRepo.count).mockResolvedValue(0);
            vi.mocked(mockRegistrationRepo.count).mockResolvedValue(20);
            const result = await makeUseCase().execute();
            expect(result.stats?.totalRegistrations).toBe(20);
        });
    });
});
