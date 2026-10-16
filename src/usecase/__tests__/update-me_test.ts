import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { compare, hash } from 'bcrypt';
import { CURRENT_PASSWORD_REQUIRED, CURRENT_PASSWORD_WRONG, UpdateMeUseCase } from '../update-me.js';
import type { UserAdminRepository } from '../../ports/external/user-admin-repository.js';
import type { UserDataRepository } from '../../ports/external/user-data-repository.js';

const adminRepo = {
    findById: vi.fn(),
    findByUsername: vi.fn(),
    update: vi.fn(),
} as unknown as UserAdminRepository;

const userDataRepo = { update: vi.fn() } as unknown as UserDataRepository;

const uc = () => new UpdateMeUseCase(adminRepo, userDataRepo);
let passwordHash: string;

beforeAll(async () => {
    passwordHash = await hash('senhaAtual123', 4);
});

// Trocar a senha pede a senha atual: um token vazado não vira mais posse
// definitiva da conta.
describe('UpdateMeUseCase — senha atual', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(adminRepo.findById).mockResolvedValue({ id: 'me',
userDataId: 'ud-me',
passwordHash } as never);
        vi.mocked(adminRepo.findByUsername).mockResolvedValue(null);
    });

    it('sem a senha atual → 400 e nada gravado', async () => {
        const r = await uc().execute('me', { password: 'senhaNova123',
name: 'NOVO NOME' });
        expect(r.error?.name).toBe('ValidationError');
        expect(r.error?.message).toBe(CURRENT_PASSWORD_REQUIRED);
        expect(adminRepo.update).not.toHaveBeenCalled();
        expect(userDataRepo.update).not.toHaveBeenCalled();
    });

    it('senha atual errada → 400 e nada gravado', async () => {
        const r = await uc().execute('me', { password: 'senhaNova123',
currentPassword: 'chute',
username: 'outro' });
        expect(r.error?.message).toBe(CURRENT_PASSWORD_WRONG);
        expect(adminRepo.update).not.toHaveBeenCalled();
    });

    it('senha atual certa → grava o hash da nova', async () => {
        const r = await uc().execute('me', { password: 'senhaNova123',
currentPassword: 'senhaAtual123' });
        expect(r.error).toBeUndefined();
        const saved = vi.mocked(adminRepo.update).mock.calls[0][1] as { passwordHash: string };
        expect(await compare('senhaNova123', saved.passwordHash)).toBe(true);
    });

    it('nome e usuário sozinhos não pedem a senha atual', async () => {
        const r = await uc().execute('me', { name: 'NOVO NOME',
username: 'novo.usuario' });
        expect(r.error).toBeUndefined();
        expect(adminRepo.update).toHaveBeenCalledWith('me', { username: 'novo.usuario' });
        expect(userDataRepo.update).toHaveBeenCalledWith('ud-me', { name: 'NOVO NOME' });
    });

    it('senha nova curta continua recusada antes de conferir a atual', async () => {
        const r = await uc().execute('me', { password: 'curta',
currentPassword: 'senhaAtual123' });
        expect(r.error?.message).toBe('A senha deve ter ao menos 8 caracteres');
        expect(adminRepo.update).not.toHaveBeenCalled();
    });
});
