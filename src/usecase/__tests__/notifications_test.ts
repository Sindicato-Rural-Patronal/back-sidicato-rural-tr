import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListNotificationsUseCase, MarkNotificationsReadUseCase } from '../notifications.js';
import type { NotificationRepository } from '../../ports/external/notification-repository.js';
import type { PendingNotification } from '../pending-notifications.js';

const repo = {
    listVisible: vi.fn(),
    countUnread: vi.fn(),
    markRead: vi.fn(),
} as unknown as NotificationRepository;

const NOW = new Date('2026-09-17T15:00:00.000Z');
const clock = () => NOW;
const THIRTY_DAYS_AGO = new Date('2026-08-18T15:00:00.000Z');
const PERMS = ['READ_COURSE', 'READ_CONTACT'];

const event = {
    id: 'n1',
    type: 'COURSE_REGISTRATION',
    title: 'Nova inscrição em Curso',
    body: 'JOÃO',
    link: '/admin/cursos?curso=c1&aba=inscricoes',
    createdAt: NOW,
    read: false,
};
const pendingItem: PendingNotification = {
    type: 'QUOTES_MISSING',
    title: 'Cotações do dia não lançadas',
    body: null,
    count: 1,
    link: '/admin/cotacoes',
    severity: 'warning',
};

describe('ListNotificationsUseCase', () => {
    beforeEach(() => vi.clearAllMocks());

    it('usa a janela de 30 dias, as permissões do admin e junta as pendências', async () => {
        vi.mocked(repo.listVisible).mockResolvedValue([event]);
        vi.mocked(repo.countUnread).mockResolvedValue(3);
        const pending = vi.fn().mockResolvedValue([pendingItem]);

        const { result } = await new ListNotificationsUseCase(repo, pending, clock).execute('admin-1', PERMS);

        const scope = { adminId: 'admin-1',
permissions: PERMS,
since: THIRTY_DAYS_AGO };
        expect(repo.listVisible).toHaveBeenCalledWith(scope, 50);
        expect(repo.countUnread).toHaveBeenCalledWith(scope);
        expect(pending).toHaveBeenCalledWith(PERMS, NOW);
        expect(result).toEqual({ unreadCount: 3,
pendingCount: 1,
events: [event],
pending: [pendingItem] });
    });

    it('sem nada: listas vazias e contadores zerados', async () => {
        vi.mocked(repo.listVisible).mockResolvedValue([]);
        vi.mocked(repo.countUnread).mockResolvedValue(0);
        const { result } = await new ListNotificationsUseCase(repo, async () => [], clock).execute('admin-1', []);
        expect(result).toEqual({ unreadCount: 0,
pendingCount: 0,
events: [],
pending: [] });
    });
});

describe('MarkNotificationsReadUseCase', () => {
    beforeEach(() => vi.clearAllMocks());

    it('sem ids marca todas as visíveis não lidas', async () => {
        vi.mocked(repo.markRead).mockResolvedValue(4);
        const res = await new MarkNotificationsReadUseCase(repo, clock).execute('admin-1', PERMS, {});
        expect(res).toEqual({ updated: 4 });
        expect(repo.markRead).toHaveBeenCalledWith(
            { adminId: 'admin-1',
permissions: PERMS,
since: THIRTY_DAYS_AGO },
            undefined,
        );
    });

    it('corpo ausente vale como "todas"', async () => {
        vi.mocked(repo.markRead).mockResolvedValue(0);
        const res = await new MarkNotificationsReadUseCase(repo, clock).execute('admin-1', PERMS, undefined);
        expect(res).toEqual({ updated: 0 });
        expect(repo.markRead).toHaveBeenCalledOnce();
    });

    it('com ids marca só esses', async () => {
        vi.mocked(repo.markRead).mockResolvedValue(1);
        const res = await new MarkNotificationsReadUseCase(repo, clock).execute('admin-1', PERMS, { ids: ['n1'] });
        expect(res).toEqual({ updated: 1 });
        expect(repo.markRead).toHaveBeenCalledWith(expect.objectContaining({ adminId: 'admin-1' }), ['n1']);
    });

    it('lista de ids vazia não marca nada (não vira "todas")', async () => {
        const res = await new MarkNotificationsReadUseCase(repo, clock).execute('admin-1', PERMS, { ids: [] });
        expect(res).toEqual({ updated: 0 });
        expect(repo.markRead).not.toHaveBeenCalled();
    });

    it('ids inválidos → erro de validação', async () => {
        const res = await new MarkNotificationsReadUseCase(repo, clock).execute('admin-1', PERMS, { ids: 'n1' });
        expect(res.error).toBeDefined();
        expect(repo.markRead).not.toHaveBeenCalled();
    });
});
