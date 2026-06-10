import type { CourseRepository } from '../ports/external/course-repository.js';
import { CourseStatus } from '../ports/external/course-repository.js';
import type { UserDataRepository } from '../ports/external/user-data-repository.js';
import type { UserAdminRepository } from '../ports/external/user-admin-repository.js';

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
    ) {}

    async execute(): Promise<DashboardStatsResponse> {
        console.log(`[DashboardStats] fetching stats`);
        const [allUsers, allAdmins, allCourses] = await Promise.all([
            this.userDataRepository.findAll(),
            this.userAdminRepository.findAll(),
            this.courseRepository.findAll(),
        ]);

        const publicCount = allCourses.filter(c => c.status === CourseStatus.PUBLICO).length;
        const privateCount = allCourses.filter(c => c.status === CourseStatus.PRIVADO).length;
        const unpublishedCount = allCourses.filter(
            c => c.status === CourseStatus.NAO_PUBLICADO,
        ).length;
        const totalRegistrations = allCourses.reduce(
            (sum, c) => sum + c._count.courseUserRegistration,
            0,
        );

        console.log(
            `[DashboardStats] users=${allUsers.length} admins=${allAdmins.length} courses=${allCourses.length} registrations=${totalRegistrations}`,
        );
        return {
            stats: {
                totalUsers: allUsers.length,
                totalAdmins: allAdmins.length,
                courses: {
                    total: allCourses.length,
                    public: publicCount,
                    private: privateCount,
                    unpublished: unpublishedCount,
                },
                totalRegistrations,
            },
        };
    }
}
