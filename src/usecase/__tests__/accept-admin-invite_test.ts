import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AcceptAdminInviteUseCase } from '../accept-admin-invite.js';
import type { AdminInviteRepository } from '../../ports/external/admin-invite-repository.js';
import type { UserAdminRepository } from '../../ports/external/user-admin-repository.js';
import type { UserDataRepository } from '../../ports/external/user-data-repository.js';
import type { NotificationPublisher } from '../../ports/external/notification-repository.js';

const inviteRepo = { findByToken: vi.fn(),
consume: vi.fn() } as unknown as AdminInviteRepository;
const userAdminRepo = {
    findByUsernameAny: vi.fn(),
    findByUserDataIdAny: vi.fn(),
    create: vi.fn(),
    reactivate: vi.fn(),
    update: vi.fn(),
} as unknown as UserAdminRepository;
const userDataRepo = { findById: vi.fn() } as unknown as UserDataRepository;
const publisher = { publish: vi.fn() } as unknown as NotificationPublisher;

const invite = {
    id: 'inv-1',
    token: 'tok',
    userDataId: 'ud-1',
    rulesId: 'rule-1',
    expiresAt: new Date(Date.now() + 60_000),
    usedAt: null,
};

const useCase = () => new AcceptAdminInviteUseCase(inviteRepo, userAdminRepo, userDataRepo, publisher);

function validInvite() {
    vi.mocked(inviteRepo.findByToken).mockResolvedValue(invite as never);
    vi.mocked(inviteRepo.consume).mockResolvedValue(true);
    vi.mocked(userAdminRepo.findByUsernameAny).mockResolvedValue(null);
    vi.mocked(userAdminRepo.findByUserDataIdAny).mockResolvedValue(null);
    vi.mocked(userDataRepo.findById).mockResolvedValue({ id: 'ud-1',
name: 'ANA SOUZA' } as never);
}

describe('AcceptAdminInviteUseCase — notificação', () => {
    beforeEach(() => vi.clearAllMocks());

    it('ativa o acesso e avisa quem tem READ_USER_ADMIN', async () => {
        validInvite();
        const result = await useCase().execute('tok', 'ana.souza', 'senha-forte-1');
        expect(result.error).toBeUndefined();
        expect(userAdminRepo.create).toHaveBeenCalledOnce();
        expect(publisher.publish).toHaveBeenCalledWith({
            type: 'INVITE_ACCEPTED',
            permission: 'READ_USER_ADMIN',
            title: 'ANA SOUZA ativou o acesso ao painel',
            body: null,
            link: '/admin/usuarios?tab=admins',
            entityId: 'ud-1',
        });
    });

    it('falha ao publicar (ou ao ler a pessoa) não desfaz a ativação', async () => {
        validInvite();
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.mocked(publisher.publish).mockRejectedValueOnce(new Error('banco fora'));
        expect((await useCase().execute('tok', 'ana.souza', 'senha-forte-1')).error).toBeUndefined();

        vi.mocked(userDataRepo.findById).mockRejectedValueOnce(new Error('banco fora'));
        expect((await useCase().execute('tok', 'ana.souza', 'senha-forte-1')).error).toBeUndefined();
        spy.mockRestore();
    });

    it('convite inválido não publica', async () => {
        vi.mocked(inviteRepo.findByToken).mockResolvedValue(null);
        const result = await useCase().execute('tok', 'ana.souza', 'senha-forte-1');
        expect(result.error).toBeDefined();
        expect(publisher.publish).not.toHaveBeenCalled();
    });
});
