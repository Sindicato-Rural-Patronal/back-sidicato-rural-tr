import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeleteUserDataUseCase } from '../delete-user-data.js';
import type { UserDataRepository } from '../../ports/external/user-data-repository.js';
import type { UserAdminRepository } from '../../ports/external/user-admin-repository.js';
import type { RuleRepository } from '../../ports/external/rule-repository.js';

const userRepo = { findById: vi.fn(),
delete: vi.fn() } as unknown as UserDataRepository;
const adminRepo = { findByUserDataId: vi.fn(),
count: vi.fn() } as unknown as UserAdminRepository;
const ruleRepo = { findById: vi.fn() } as unknown as RuleRepository;

const RULES: Record<string, string[]> = {
    super: ['DELETE_USER', 'DELETE_USER_ADMIN', 'READ_FINANCE'],
    secretaria: ['DELETE_USER', 'DELETE_USER_ADMIN'],
    basico: ['DELETE_USER'],
};

const uc = () => new DeleteUserDataUseCase(userRepo, adminRepo, ruleRepo);
const actor = (id: string, rule: string) => ({ id,
permissions: RULES[rule] });

function adminOf(personId: string, id: string, rulesId: string) {
    return { id,
username: id,
userDataId: personId,
rulesId,
isDeleted: false } as never;
}

// Excluir a pessoa leva o login junto: se ela é administradora, valem as
// travas de excluir admin (antes DELETE_USER derrubava qualquer admin).
describe('DeleteUserDataUseCase', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(userRepo.findById).mockResolvedValue({ id: 'p1' } as never);
        vi.mocked(userRepo.delete).mockResolvedValue(true as never);
        vi.mocked(adminRepo.findByUserDataId).mockResolvedValue(null);
        vi.mocked(adminRepo.count).mockResolvedValue(3);
        vi.mocked(ruleRepo.findById).mockImplementation(async id =>
            RULES[id] ? ({ id,
permissions: RULES[id] } as never) : null);
    });

    it('pessoa sem login: basta DELETE_USER', async () => {
        const r = await uc().execute('p1', { id: 'ator',
permissions: ['DELETE_USER'] });
        expect(r.error).toBeUndefined();
        expect(userRepo.delete).toHaveBeenCalledWith('p1');
    });

    it('pessoa com login exige também DELETE_USER_ADMIN', async () => {
        vi.mocked(adminRepo.findByUserDataId).mockResolvedValue(adminOf('p1', 'adm-p1', 'basico'));
        const r = await uc().execute('p1', { id: 'ator',
permissions: ['DELETE_USER'] });
        expect(r.error?.name).toBe('ForbiddenError');
        expect(r.error?.message).toMatch(/excluir administradores/);
        expect(userRepo.delete).not.toHaveBeenCalled();
    });

    it('não exclui o próprio cadastro', async () => {
        vi.mocked(adminRepo.findByUserDataId).mockResolvedValue(adminOf('p1', 'ator', 'secretaria'));
        const r = await uc().execute('p1', actor('ator', 'secretaria'));
        expect(r.error?.name).toBe('ValidationError');
        expect(r.error?.message).toMatch(/próprio cadastro/);
        expect(userRepo.delete).not.toHaveBeenCalled();
    });

    it('não exclui administrador com permissões além das do ator', async () => {
        vi.mocked(adminRepo.findByUserDataId).mockResolvedValue(adminOf('p1', 'adm-p1', 'super'));
        const r = await uc().execute('p1', actor('ator', 'secretaria'));
        expect(r.error?.name).toBe('ForbiddenError');
        expect(userRepo.delete).not.toHaveBeenCalled();
    });

    it('nunca exclui o último administrador ativo', async () => {
        vi.mocked(adminRepo.findByUserDataId).mockResolvedValue(adminOf('p1', 'adm-p1', 'basico'));
        vi.mocked(adminRepo.count).mockResolvedValue(1);
        const r = await uc().execute('p1', actor('ator', 'secretaria'));
        expect(r.error?.message).toMatch(/último administrador/);
        expect(userRepo.delete).not.toHaveBeenCalled();
    });

    it('exclui administrador com permissões contidas nas do ator', async () => {
        vi.mocked(adminRepo.findByUserDataId).mockResolvedValue(adminOf('p1', 'adm-p1', 'basico'));
        const r = await uc().execute('p1', actor('ator', 'secretaria'));
        expect(r.error).toBeUndefined();
        expect(userRepo.delete).toHaveBeenCalledWith('p1');
    });

    it('pessoa inexistente → 404', async () => {
        vi.mocked(userRepo.findById).mockResolvedValue(null);
        const r = await uc().execute('nada', actor('ator', 'secretaria'));
        expect(r.error?.name).toBe('UserNotFoundError');
    });
});
