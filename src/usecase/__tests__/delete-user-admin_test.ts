import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeleteUserAdminUseCase } from '../delete-user-admin.js';
import type { UserAdminRepository } from '../../ports/external/user-admin-repository.js';
import type { RuleRepository } from '../../ports/external/rule-repository.js';

const adminRepo = {
    findById: vi.fn(),
    count: vi.fn(),
    delete: vi.fn(),
} as unknown as UserAdminRepository;

const ruleRepo = { findById: vi.fn() } as unknown as RuleRepository;

const RULES: Record<string, string[]> = {
    super: ['READ_USER_ADMIN', 'DELETE_USER_ADMIN', 'READ_FINANCE'],
    gestor: ['READ_USER_ADMIN', 'DELETE_USER_ADMIN'],
    leitor: ['READ_USER_ADMIN'],
};

const ACTOR_ID = 'admin-ator';
const uc = () => new DeleteUserAdminUseCase(adminRepo, ruleRepo);

function admin(id: string, rulesId: string) {
    return { id,
username: id,
userDataId: `ud-${id}`,
rulesId,
isDeleted: false } as never;
}

describe('DeleteUserAdminUseCase — travas', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(ruleRepo.findById).mockImplementation(async id =>
            RULES[id] ? ({ id,
permissions: RULES[id] } as never) : null);
        vi.mocked(adminRepo.count).mockResolvedValue(3);
        vi.mocked(adminRepo.delete).mockResolvedValue(true as never);
    });

    it('não exclui a própria conta', async () => {
        vi.mocked(adminRepo.findById).mockResolvedValue(admin(ACTOR_ID, 'gestor'));
        const r = await uc().execute(ACTOR_ID, ACTOR_ID, RULES.gestor);
        expect(r.error?.name).toBe('ValidationError');
        expect(r.error?.message).toBe('Você não pode excluir a sua própria conta de administrador.');
        expect(adminRepo.delete).not.toHaveBeenCalled();
    });

    it('não exclui admin com permissões além das do ator', async () => {
        vi.mocked(adminRepo.findById).mockResolvedValue(admin('outro', 'super'));
        const r = await uc().execute('outro', ACTOR_ID, RULES.gestor);
        expect(r.error?.name).toBe('ForbiddenError');
        expect(adminRepo.delete).not.toHaveBeenCalled();
    });

    it('nunca exclui o último admin ativo', async () => {
        vi.mocked(adminRepo.findById).mockResolvedValue(admin('outro', 'leitor'));
        vi.mocked(adminRepo.count).mockResolvedValue(1);
        const r = await uc().execute('outro', ACTOR_ID, RULES.gestor);
        expect(r.error?.message).toBe('Não é possível excluir o último administrador ativo.');
        expect(adminRepo.delete).not.toHaveBeenCalled();
    });

    it('exclui admin com permissões contidas nas do ator', async () => {
        vi.mocked(adminRepo.findById).mockResolvedValue(admin('outro', 'leitor'));
        const r = await uc().execute('outro', ACTOR_ID, RULES.gestor);
        expect(r.error).toBeUndefined();
        expect(adminRepo.delete).toHaveBeenCalledWith('outro');
    });

    it('admin inexistente → 404', async () => {
        vi.mocked(adminRepo.findById).mockResolvedValue(null);
        const r = await uc().execute('nada', ACTOR_ID, RULES.gestor);
        expect(r.error?.name).toBe('AdminNotFoundError');
    });
});
