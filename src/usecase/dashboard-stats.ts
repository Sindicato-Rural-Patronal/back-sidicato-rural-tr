import type { CourseRepository } from '../ports/external/course-repository.js';
import { CourseStatus } from '../ports/external/course-repository.js';
import type { UserDataRepository } from '../ports/external/user-data-repository.js';
import type { UserAdminRepository } from '../ports/external/user-admin-repository.js';
import type { RegistrationRepository } from '../ports/external/registration-repository.js';

export type DashboardStats = {
    totalUsers: number;
    totalAdmins: number;
    courses: {
        total: number;
        public: number;
        private: number;
        unpublished: number;
    };
    totalRegistrations: number;
    registrationsLast30Days: number;
};

type DashboardStatsResponse = {
    error?: Error;
    stats?: DashboardStats;
};

export class DashboardStatsUseCase {
    constructor(
        private readonly courseRepository: CourseRepository,
        private readonly userDataRepository: UserDataRepository,
        private readonly userAdminRepository: UserAdminRepository,
        private readonly registrationRepository: RegistrationRepository,
    ) {}

    async execute(): Promise<DashboardStatsResponse> {
        const since30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        const [
            totalUsers,
            totalAdmins,
            totalCourses,
            publicCourses,
            privateCourses,
            unpublishedCourses,
            totalRegistrations,
            registrationsLast30Days,
        ] = await Promise.all([
            this.userDataRepository.count(),
            this.userAdminRepository.count(),
            this.courseRepository.count(),
            this.courseRepository.count({ status: CourseStatus.PUBLIC }),
            this.courseRepository.count({ status: CourseStatus.PRIVATE }),
            this.courseRepository.count({ status: CourseStatus.UNPUBLISHED }),
            this.registrationRepository.count(),
            this.registrationRepository.count({ since: since30Days }),
        ]);

        return {
            stats: {
                totalUsers,
                totalAdmins,
                courses: {
                    total: totalCourses,
                    public: publicCourses,
                    private: privateCourses,
                    unpublished: unpublishedCourses,
                },
                totalRegistrations,
                registrationsLast30Days,
            },
        };
    }
}
