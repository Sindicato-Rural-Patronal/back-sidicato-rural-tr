import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UpdateUserAdminUseCase } from '../update-user-admin.js';
import type { UserAdminRepository } from '../../ports/external/user-admin-repository.js';
import type { RuleRepository } from '../../ports/external/rule-repository.js';

const adminRepo = {
    findById: vi.fn(),
    findByUsername: vi.fn(),
    update: vi.fn(),
} as unknown as UserAdminRepository;

const ruleRepo = { findById: vi.fn() } as unknown as RuleRepository;

// rulesId é UUID (o schema confere).
const SUPER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const GESTOR = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const LEITOR = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const RULES: Record<string, string[]> = {
    [SUPER]: ['READ_USER_ADMIN', 'UPDATE_USER_ADMIN', 'DELETE_USER_ADMIN', 'READ_FINANCE'],
    [GESTOR]: ['READ_USER_ADMIN', 'UPDATE_USER_ADMIN'],
    [LEITOR]: ['READ_USER_ADMIN'],
};

const ACTOR = RULES[GESTOR];
const TARGET_ID = '11111111-1111-4111-8111-111111111111';

function target(rulesId: string) {
    return { id: TARGET_ID,
username: 'alvo',
userDataId: 'ud-alvo',
rulesId,
isDeleted: false } as never;
}

const uc = () => new UpdateUserAdminUseCase(adminRepo, ruleRepo);

describe('UpdateUserAdminUseCase — anti-escalonamento', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(ruleRepo.findById).mockImplementation(async id =>
            RULES[id] ? ({ id,
permissions: RULES[id] } as never) : null);
        vi.mocked(adminRepo.findByUsername).mockResolvedValue(null);
        vi.mocked(adminRepo.update).mockResolvedValue({ id: TARGET_ID } as never);
    });

    // O buraco que existia: só a regra NOVA era conferida, então quem tinha
    // UPDATE_USER_ADMIN trocava a senha do super admin e entrava como ele.
    it.each([
        ['a senha', { password: 'novaSenha123' }],
        ['o usuário', { username: 'outro' }],
        ['a regra (mesmo para uma mais fraca)', { rulesId: LEITOR }],
    ])('recusa trocar %s de um admin mais forte que o ator', async (_campo, body) => {
        vi.mocked(adminRepo.findById).mockResolvedValue(target(SUPER));
        const r = await uc().execute({ targetAdminId: TARGET_ID,
...body }, ACTOR);
        expect(r.error?.name).toBe('ForbiddenError');
        expect(r.error?.message).toBe('Você não pode alterar um administrador com permissões além das suas.');
        expect(adminRepo.update).not.toHaveBeenCalled();
    });

    it('deixa editar admin com permissões contidas nas do ator', async () => {
        vi.mocked(adminRepo.findById).mockResolvedValue(target(LEITOR));
        const r = await uc().execute({ targetAdminId: TARGET_ID,
password: 'novaSenha123' }, ACTOR);
        expect(r.error).toBeUndefined();
        expect(adminRepo.update).toHaveBeenCalledWith(TARGET_ID, expect.objectContaining({ passwordHash: expect.any(String) }));
    });

    it('recusa dar ao alvo uma regra mais forte que a do ator', async () => {
        vi.mocked(adminRepo.findById).mockResolvedValue(target(LEITOR));
        const r = await uc().execute({ targetAdminId: TARGET_ID,
rulesId: SUPER }, ACTOR);
        expect(r.error?.name).toBe('ForbiddenError');
        expect(r.error?.message).toBe('Você não pode atribuir uma regra com permissões além das suas.');
        expect(adminRepo.update).not.toHaveBeenCalled();
    });

    it('deixa dar uma regra contida nas do ator', async () => {
        vi.mocked(adminRepo.findById).mockResolvedValue(target(LEITOR));
        const r = await uc().execute({ targetAdminId: TARGET_ID,
rulesId: GESTOR }, ACTOR);
        expect(r.error).toBeUndefined();
        expect(adminRepo.update).toHaveBeenCalledWith(TARGET_ID, { rulesId: GESTOR });
    });

    it('recusa usuário só com espaços', async () => {
        vi.mocked(adminRepo.findById).mockResolvedValue(target(LEITOR));
        const r = await uc().execute({ targetAdminId: TARGET_ID,
username: '   ' }, ACTOR);
        expect(r.error?.name).toBe('ValidationError');
        expect(adminRepo.update).not.toHaveBeenCalled();
    });

    it('admin inexistente → 404 antes de qualquer checagem', async () => {
        vi.mocked(adminRepo.findById).mockResolvedValue(null);
        const r = await uc().execute({ targetAdminId: TARGET_ID,
password: 'novaSenha123' }, ACTOR);
        expect(r.error?.name).toBe('AdminNotFoundError');
    });
});
