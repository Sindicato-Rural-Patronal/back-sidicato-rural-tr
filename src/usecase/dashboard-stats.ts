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
        const [
            totalUsers,
            totalAdmins,
            totalCourses,
            publicCourses,
            privateCourses,
            unpublishedCourses,
            totalRegistrations,
        ] = await Promise.all([
            this.userDataRepository.count(),
            this.userAdminRepository.count(),
            this.courseRepository.count(),
            this.courseRepository.count({ status: CourseStatus.PUBLIC }),
            this.courseRepository.count({ status: CourseStatus.PRIVATE }),
            this.courseRepository.count({ status: CourseStatus.UNPUBLISHED }),
            this.registrationRepository.count(),
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
            },
        };
    }
}
