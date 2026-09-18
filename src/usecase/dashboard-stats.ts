import type { CourseRepository } from '../ports/external/course-repository.js';
import { CourseStatus } from '../ports/external/course-repository.js';
import type { UserDataRepository } from '../ports/external/user-data-repository.js';
import type { UserAdminRepository } from '../ports/external/user-admin-repository.js';
import type { RegistrationRepository } from '../ports/external/registration-repository.js';
import type { RoomRepository } from '../ports/external/room-repository.js';
import type { ContactMessageRepository } from '../ports/external/contact-message-repository.js';
import type { DashboardRepository, QuotePeriod } from '../ports/external/dashboard-repository.js';
import type { PendingNotificationsRepository } from '../ports/external/pending-notifications-repository.js';

// Números do Painel Geral. Cada bloco só é consultado quando a regra do admin
// permite ver aquele assunto — o que ele não pode ver simplesmente não vem na
// resposta (em vez de a rota inteira dar 403).

const DAY_MS = 24 * 60 * 60 * 1000;
// Brasília é UTC-3 fixo (sem horário de verão desde 2019).
const BRASILIA_OFFSET_MS = 3 * 60 * 60 * 1000;

/** Janela do cartão "próximos cursos": hoje + 7 dias (inclusive). */
export const COURSES_STARTING_DAYS = 7;
/** Janela do cartão "associações vencendo": hoje + 30 dias (inclusive) — igual à do sino. */
export const MEMBERSHIP_WINDOW_DAYS = 30;
/** Janela das inscrições recentes. */
export const REGISTRATIONS_WINDOW_DAYS = 30;

/**
 * Hoje em Brasília como meia-noite rotulada com Z — o mesmo formato das datas
 * "de parede" do curso e do `referenceDate` das cotações.
 */
export function brasiliaToday(now: Date): Date {
    const wall = new Date(now.getTime() - BRASILIA_OFFSET_MS);
    return new Date(Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate()));
}

const addDays = (date: Date, days: number) => new Date(date.getTime() + days * DAY_MS);

export type DashboardStats = {
    // ── READ_COURSE ──
    courses?: {
        total: number;
        public: number;
        private: number;
        unpublished: number;
        inProgress: number;
        completed: number;
    };
    totalRooms?: number;
    registrations?: {
        last30Days: number;
        /** Inscrições ativas sem confirmar em cursos que ainda não terminaram. */
        pendingConfirmation: number;
    };
    coursesStartingIn7Days?: number;
    /** @deprecated use `registrations.last30Days` — mantido para o painel antigo. */
    totalRegistrations?: number;
    /** @deprecated use `registrations.last30Days` — mantido para o painel antigo. */
    registrationsLast30Days?: number;
    // ── READ_USER ──
    totalUsers?: number;
    membershipsExpiring30Days?: number;
    // ── READ_USER_ADMIN ──
    totalAdmins?: number;
    // ── READ_CONTACT ──
    unreadMessages?: number;
    // ── READ_MARKET_QUOTE ──
    quotesToday?: {
        launched: boolean;
        period: QuotePeriod | null;
    };
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
        private readonly roomRepository: RoomRepository,
        private readonly contactMessageRepository: ContactMessageRepository,
        private readonly dashboardRepository: DashboardRepository,
        /** O mesmo repositório do sino: as associações vencendo nunca divergem. */
        private readonly pendingRepository: PendingNotificationsRepository,
    ) {}

    /** Blocos de curso/inscrição/sala (READ_COURSE). */
    private async courseBlock(today: Date, now: Date): Promise<DashboardStats> {
        const since30Days = new Date(now.getTime() - REGISTRATIONS_WINDOW_DAYS * DAY_MS);
        const [
            total,
            publicCourses,
            privateCourses,
            unpublished,
            inProgress,
            completed,
            totalRooms,
            totalRegistrations,
            last30Days,
            pendingConfirmation,
            coursesStartingIn7Days,
        ] = await Promise.all([
            this.courseRepository.count(),
            this.courseRepository.count({ status: CourseStatus.PUBLIC }),
            this.courseRepository.count({ status: CourseStatus.PRIVATE }),
            this.courseRepository.count({ status: CourseStatus.UNPUBLISHED }),
            this.courseRepository.count({ status: CourseStatus.IN_PROGRESS }),
            this.courseRepository.count({ status: CourseStatus.COMPLETED }),
            this.roomRepository.count(),
            this.registrationRepository.count(),
            this.registrationRepository.count({ since: since30Days }),
            this.dashboardRepository.countPendingConfirmation(today),
            // De hoje até hoje + 7, inclusive.
            this.dashboardRepository.countCoursesStarting(
                today,
                addDays(today, COURSES_STARTING_DAYS + 1),
            ),
        ]);
        return {
            courses: { total,
public: publicCourses,
private: privateCourses,
unpublished,
inProgress,
completed },
            totalRooms,
            registrations: { last30Days,
pendingConfirmation },
            coursesStartingIn7Days,
            totalRegistrations,
            registrationsLast30Days: last30Days,
        };
    }

    /** Pessoas e associações vencendo (READ_USER). */
    private async userBlock(today: Date): Promise<DashboardStats> {
        const [totalUsers, expiring] = await Promise.all([
            this.userDataRepository.count(),
            // Mesma regra do sino: validade de hoje até hoje + 30 (inclusive).
            this.pendingRepository.membershipsExpiring(
                today,
                addDays(today, MEMBERSHIP_WINDOW_DAYS + 1),
                0,
            ),
        ]);
        return { totalUsers,
membershipsExpiring30Days: expiring.total };
    }

    /** Lançamento de cotações de hoje (READ_MARKET_QUOTE). */
    private async quotesBlock(today: Date): Promise<DashboardStats> {
        const tomorrow = addDays(today, 1);
        const [launched, period] = await Promise.all([
            this.pendingRepository.countQuoteHistory(today, tomorrow),
            this.dashboardRepository.lastQuotePeriodOfDay(today, tomorrow),
        ]);
        return { quotesToday: { launched: launched > 0,
period } };
    }

    async execute(permissions: string[] = [], now: Date = new Date()): Promise<DashboardStatsResponse> {
        const can = (permission: string) => permissions.includes(permission);
        const today = brasiliaToday(now);
        const none = Promise.resolve<DashboardStats>({});

        const blocks = await Promise.all([
            can('READ_COURSE') ? this.courseBlock(today, now) : none,
            can('READ_USER') ? this.userBlock(today) : none,
            can('READ_USER_ADMIN')
                ? this.userAdminRepository.count().then(totalAdmins => ({ totalAdmins }))
                : none,
            can('READ_CONTACT')
                ? this.contactMessageRepository
                      .count({ read: false })
                      .then(unreadMessages => ({ unreadMessages }))
                : none,
            can('READ_MARKET_QUOTE') ? this.quotesBlock(today) : none,
        ]);

        return { stats: Object.assign({}, ...blocks) as DashboardStats };
    }
}
