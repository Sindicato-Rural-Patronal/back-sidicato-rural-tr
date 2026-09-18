import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DashboardStatsUseCase, brasiliaToday } from '../dashboard-stats.js';
import { CourseStatus } from '../../ports/external/course-repository.js';
import type { CourseRepository } from '../../ports/external/course-repository.js';
import type { UserDataRepository } from '../../ports/external/user-data-repository.js';
import type { UserAdminRepository } from '../../ports/external/user-admin-repository.js';
import type { RegistrationRepository } from '../../ports/external/registration-repository.js';
import type { RoomRepository } from '../../ports/external/room-repository.js';
import type { ContactMessageRepository } from '../../ports/external/contact-message-repository.js';
import type { DashboardRepository } from '../../ports/external/dashboard-repository.js';
import type { PendingNotificationsRepository } from '../../ports/external/pending-notifications-repository.js';

const ALL = [
    'READ_COURSE',
    'READ_USER',
    'READ_USER_ADMIN',
    'READ_CONTACT',
    'READ_MARKET_QUOTE',
];

const mockCourseRepo = { count: vi.fn() } as unknown as CourseRepository;
const mockUserDataRepo = { count: vi.fn() } as unknown as UserDataRepository;
const mockUserAdminRepo = { count: vi.fn() } as unknown as UserAdminRepository;
const mockRegistrationRepo = { count: vi.fn() } as unknown as RegistrationRepository;
const mockRoomRepo = { count: vi.fn() } as unknown as RoomRepository;
const mockContactRepo = { count: vi.fn() } as unknown as ContactMessageRepository;
const mockDashboardRepo = {
    countPendingConfirmation: vi.fn(),
    countCoursesStarting: vi.fn(),
    lastQuotePeriodOfDay: vi.fn(),
} as unknown as DashboardRepository;
const mockPendingRepo = {
    membershipsExpiring: vi.fn(),
    countQuoteHistory: vi.fn(),
} as unknown as PendingNotificationsRepository;

function makeUseCase() {
    return new DashboardStatsUseCase(
        mockCourseRepo,
        mockUserDataRepo,
        mockUserAdminRepo,
        mockRegistrationRepo,
        mockRoomRepo,
        mockContactRepo,
        mockDashboardRepo,
        mockPendingRepo,
    );
}

/** Todos os repositórios respondem algo válido (cada teste sobrescreve o que importa). */
function defaults() {
    vi.mocked(mockCourseRepo.count).mockResolvedValue(0);
    vi.mocked(mockUserDataRepo.count).mockResolvedValue(0);
    vi.mocked(mockUserAdminRepo.count).mockResolvedValue(0);
    vi.mocked(mockRegistrationRepo.count).mockResolvedValue(0);
    vi.mocked(mockRoomRepo.count).mockResolvedValue(0);
    vi.mocked(mockContactRepo.count).mockResolvedValue(0);
    vi.mocked(mockDashboardRepo.countPendingConfirmation).mockResolvedValue(0);
    vi.mocked(mockDashboardRepo.countCoursesStarting).mockResolvedValue(0);
    vi.mocked(mockDashboardRepo.lastQuotePeriodOfDay).mockResolvedValue(null);
    vi.mocked(mockPendingRepo.membershipsExpiring).mockResolvedValue({ total: 0,
names: [] });
    vi.mocked(mockPendingRepo.countQuoteHistory).mockResolvedValue(0);
}

describe('brasiliaToday', () => {
    it('vira o dia às 03:00 UTC (00:00 em Brasília, UTC-3)', () => {
        expect(brasiliaToday(new Date('2026-09-19T02:59:59.000Z')).toISOString()).toBe(
            '2026-09-18T00:00:00.000Z',
        );
        expect(brasiliaToday(new Date('2026-09-19T03:00:00.000Z')).toISOString()).toBe(
            '2026-09-19T00:00:00.000Z',
        );
    });

    it('à noite (UTC) ainda é o mesmo dia em Brasília', () => {
        expect(brasiliaToday(new Date('2026-09-18T23:30:00.000Z')).toISOString()).toBe(
            '2026-09-18T00:00:00.000Z',
        );
    });
});

describe('DashboardStatsUseCase', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        defaults();
    });

    describe('contagens', () => {
        it('agrupa cursos por status, inclusive em andamento e concluídos', async () => {
            vi.mocked(mockCourseRepo.count).mockImplementation(filters => {
                if (!filters?.status) return Promise.resolve(9);
                const byStatus: Record<string, number> = {
                    [CourseStatus.PUBLIC]: 2,
                    [CourseStatus.PRIVATE]: 1,
                    [CourseStatus.UNPUBLISHED]: 3,
                    [CourseStatus.IN_PROGRESS]: 1,
                    [CourseStatus.COMPLETED]: 2,
                };
                return Promise.resolve(byStatus[filters.status] ?? 0);
            });
            const { stats } = await makeUseCase().execute(ALL);
            expect(stats?.courses).toEqual({
                total: 9,
                public: 2,
                private: 1,
                unpublished: 3,
                inProgress: 1,
                completed: 2,
            });
        });

        it('traz inscrições dos 30 dias, pendentes de confirmação e os nomes antigos', async () => {
            vi.mocked(mockRegistrationRepo.count).mockImplementation(filter =>
                Promise.resolve(filter?.since ? 5 : 20),
            );
            vi.mocked(mockDashboardRepo.countPendingConfirmation).mockResolvedValue(4);
            const { stats } = await makeUseCase().execute(ALL);
            expect(stats?.registrations).toEqual({ last30Days: 5,
pendingConfirmation: 4 });
            // Compatibilidade com o painel antigo.
            expect(stats?.totalRegistrations).toBe(20);
            expect(stats?.registrationsLast30Days).toBe(5);
        });

        it('pede as inscrições sem confirmar só de cursos que ainda não terminaram (dia de Brasília)', async () => {
            await makeUseCase().execute(ALL, new Date('2026-09-19T02:00:00.000Z'));
            const arg = vi.mocked(mockDashboardRepo.countPendingConfirmation).mock.calls[0][0];
            // 02:00 UTC ainda é a noite do dia 18 em Brasília.
            expect(arg.toISOString()).toBe('2026-09-18T00:00:00.000Z');
        });

        it('conta cursos começando de hoje até hoje + 7 (inclusive)', async () => {
            vi.mocked(mockDashboardRepo.countCoursesStarting).mockResolvedValue(3);
            const { stats } = await makeUseCase().execute(ALL, new Date('2026-09-18T12:00:00.000Z'));
            const [from, before] = vi.mocked(mockDashboardRepo.countCoursesStarting).mock.calls[0];
            expect(from.toISOString()).toBe('2026-09-18T00:00:00.000Z');
            expect(before.toISOString()).toBe('2026-09-26T00:00:00.000Z');
            expect(stats?.coursesStartingIn7Days).toBe(3);
        });

        it('usa o mesmo repositório do sino para as associações vencendo em 30 dias', async () => {
            vi.mocked(mockPendingRepo.membershipsExpiring).mockResolvedValue({ total: 7,
names: [] });
            const { stats } = await makeUseCase().execute(ALL, new Date('2026-09-18T12:00:00.000Z'));
            const [from, before] = vi.mocked(mockPendingRepo.membershipsExpiring).mock.calls[0];
            expect(from.toISOString()).toBe('2026-09-18T00:00:00.000Z');
            expect(before.toISOString()).toBe('2026-10-19T00:00:00.000Z');
            expect(stats?.membershipsExpiring30Days).toBe(7);
        });

        it('mensagens não lidas vêm do filtro read: false', async () => {
            vi.mocked(mockContactRepo.count).mockResolvedValue(6);
            const { stats } = await makeUseCase().execute(ALL);
            expect(vi.mocked(mockContactRepo.count).mock.calls[0][0]).toEqual({ read: false });
            expect(stats?.unreadMessages).toBe(6);
        });
    });

    describe('cotações de hoje', () => {
        it('lançadas: traz o último período do dia', async () => {
            vi.mocked(mockPendingRepo.countQuoteHistory).mockResolvedValue(5);
            vi.mocked(mockDashboardRepo.lastQuotePeriodOfDay).mockResolvedValue('AFTERNOON');
            const { stats } = await makeUseCase().execute(ALL, new Date('2026-09-18T12:00:00.000Z'));
            expect(stats?.quotesToday).toEqual({ launched: true,
period: 'AFTERNOON' });
            const [from, before] = vi.mocked(mockPendingRepo.countQuoteHistory).mock.calls[0];
            expect(from.toISOString()).toBe('2026-09-18T00:00:00.000Z');
            expect(before.toISOString()).toBe('2026-09-19T00:00:00.000Z');
        });

        it('sem lançamento: launched false e período null', async () => {
            const { stats } = await makeUseCase().execute(ALL);
            expect(stats?.quotesToday).toEqual({ launched: false,
period: null });
        });
    });

    describe('filtro por permissão', () => {
        it('sem permissão nenhuma, responde objeto vazio e não consulta nada', async () => {
            const { stats } = await makeUseCase().execute([]);
            expect(stats).toEqual({});
            expect(mockCourseRepo.count).not.toHaveBeenCalled();
            expect(mockUserDataRepo.count).not.toHaveBeenCalled();
            expect(mockUserAdminRepo.count).not.toHaveBeenCalled();
            expect(mockContactRepo.count).not.toHaveBeenCalled();
            expect(mockPendingRepo.countQuoteHistory).not.toHaveBeenCalled();
        });

        it('só READ_COURSE: cursos, salas e inscrições; nada de pessoas, admins, mensagens ou cotações', async () => {
            const { stats } = await makeUseCase().execute(['READ_COURSE']);
            expect(stats?.courses).toBeDefined();
            expect(stats?.totalRooms).toBeDefined();
            expect(stats?.registrations).toBeDefined();
            expect(stats?.coursesStartingIn7Days).toBeDefined();
            expect(stats?.totalUsers).toBeUndefined();
            expect(stats?.membershipsExpiring30Days).toBeUndefined();
            expect(stats?.totalAdmins).toBeUndefined();
            expect(stats?.unreadMessages).toBeUndefined();
            expect(stats?.quotesToday).toBeUndefined();
        });

        it('só READ_USER: pessoas e associações vencendo, sem cursos', async () => {
            vi.mocked(mockUserDataRepo.count).mockResolvedValue(11);
            const { stats } = await makeUseCase().execute(['READ_USER']);
            expect(stats?.totalUsers).toBe(11);
            expect(stats?.membershipsExpiring30Days).toBe(0);
            expect(stats?.courses).toBeUndefined();
            expect(mockCourseRepo.count).not.toHaveBeenCalled();
        });

        it('só READ_USER_ADMIN devolve apenas totalAdmins', async () => {
            vi.mocked(mockUserAdminRepo.count).mockResolvedValue(2);
            const { stats } = await makeUseCase().execute(['READ_USER_ADMIN']);
            expect(stats).toEqual({ totalAdmins: 2 });
        });

        it('só READ_CONTACT devolve apenas unreadMessages', async () => {
            vi.mocked(mockContactRepo.count).mockResolvedValue(1);
            const { stats } = await makeUseCase().execute(['READ_CONTACT']);
            expect(stats).toEqual({ unreadMessages: 1 });
        });

        it('só READ_MARKET_QUOTE devolve apenas quotesToday', async () => {
            const { stats } = await makeUseCase().execute(['READ_MARKET_QUOTE']);
            expect(stats).toEqual({ quotesToday: { launched: false,
period: null } });
        });
    });
});
