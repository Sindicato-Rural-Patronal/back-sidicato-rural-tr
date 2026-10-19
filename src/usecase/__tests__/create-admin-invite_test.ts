import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateAdminInviteUseCase } from '../create-admin-invite.js';
import type { AdminInviteRepository } from '../../ports/external/admin-invite-repository.js';
import type { UserDataRepository } from '../../ports/external/user-data-repository.js';
import type { RuleRepository } from '../../ports/external/rule-repository.js';
import type { UserAdminRepository } from '../../ports/external/user-admin-repository.js';

const inviteRepo = { create: vi.fn() } as unknown as AdminInviteRepository;
const userDataRepo = { findById: vi.fn() } as unknown as UserDataRepository;
const ruleRepo = { findById: vi.fn() } as unknown as RuleRepository;
const adminRepo = { findByUserDataId: vi.fn() } as unknown as UserAdminRepository;

const uc = () => new CreateAdminInviteUseCase(inviteRepo, userDataRepo, ruleRepo, adminRepo);
const ACTOR = ['READ_USER_ADMIN', 'CREATE_USER_ADMIN', 'READ_COURSE'];

describe('CreateAdminInviteUseCase — anti-escalonamento', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(userDataRepo.findById).mockResolvedValue({ id: 'ud-1' } as never);
        vi.mocked(adminRepo.findByUserDataId).mockResolvedValue(null);
        vi.mocked(inviteRepo.create).mockResolvedValue({ id: 'inv-1' } as never);
    });

    it('recusa convidar com regra mais forte que a do ator', async () => {
        vi.mocked(ruleRepo.findById).mockResolvedValue({ id: 'r',
permissions: ['READ_COURSE', 'DELETE_USER_ADMIN'] } as never);
        const r = await uc().execute('ud-1', 'r', ACTOR);
        expect(r.error?.name).toBe('ForbiddenError');
        expect(r.token).toBeUndefined();
        expect(inviteRepo.create).not.toHaveBeenCalled();
    });

    it('convida com regra contida nas permissões do ator', async () => {
        vi.mocked(ruleRepo.findById).mockResolvedValue({ id: 'r',
permissions: ['READ_COURSE'] } as never);
        const r = await uc().execute('ud-1', 'r', ACTOR);
        expect(r.error).toBeUndefined();
        expect(r.token).toMatch(/^[A-Za-z0-9_-]{40,}$/);
        expect(r.expiresAt!.getTime()).toBeGreaterThan(Date.now());
        expect(inviteRepo.create).toHaveBeenCalledWith(expect.objectContaining({ userDataId: 'ud-1',
rulesId: 'r' }));
    });

    it('recusa convidar quem já é administrador ativo', async () => {
        vi.mocked(ruleRepo.findById).mockResolvedValue({ id: 'r',
permissions: [] } as never);
        vi.mocked(adminRepo.findByUserDataId).mockResolvedValue({ id: 'adm' } as never);
        const r = await uc().execute('ud-1', 'r', ACTOR);
        expect(r.error?.name).toBe('AdminAccountAlreadyExistsError');
        expect(inviteRepo.create).not.toHaveBeenCalled();
    });

    it('pessoa ou regra inexistente → 404', async () => {
        vi.mocked(userDataRepo.findById).mockResolvedValue(null);
        expect((await uc().execute('nada', 'r', ACTOR)).error?.name).toBe('UserDataNotFoundError');
        vi.mocked(userDataRepo.findById).mockResolvedValue({ id: 'ud-1' } as never);
        vi.mocked(ruleRepo.findById).mockResolvedValue(null);
        expect((await uc().execute('ud-1', 'nada', ACTOR)).error?.name).toBe('RuleNotFoundError');
    });
});
