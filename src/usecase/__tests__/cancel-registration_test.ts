import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CancelRegistrationUseCase } from '../cancel-registration.js';
import type { RegistrationRepository } from '../../ports/external/registration-repository.js';
import type { UserAdminRepository } from '../../ports/external/user-admin-repository.js';
import type { RuleRepository } from '../../ports/external/rule-repository.js';

vi.mock('../../lib/verify-permission.js', () => ({
    verifyPermission: vi.fn(),
}));

import { verifyPermission } from '../../lib/verify-permission.js';

const mockRegistrationRepo = {
    create: vi.fn(),
    findById: vi.fn(),
    findByCourseId: vi.fn(),
    findByUserDataAndCourse: vi.fn(),
    delete: vi.fn(),
} as unknown as RegistrationRepository;

const mockUserAdminRepo = {} as unknown as UserAdminRepository;
const mockRuleRepo = {} as unknown as RuleRepository;

describe('CancelRegistrationUseCase', () => {
    beforeEach(() => vi.clearAllMocks());

    describe('autenticação e permissão', () => {
        it('falha se token inválido ou sem permissão', async () => {
            vi.mocked(verifyPermission).mockResolvedValue({ authorized: false, statusCode: 401, error: 'Invalid or expired token' });
            const uc = new CancelRegistrationUseCase(mockRegistrationRepo, mockUserAdminRepo, mockRuleRepo);
            const result = await uc.execute({ token: 'bad-token', registrationId: 'reg-001' });
            expect(result.success).toBe(false);
            expect(result.statusCode).toBe(401);
        });

        it('usa permissão UPDATE_COURSE para cancelar inscrição', async () => {
            vi.mocked(verifyPermission).mockResolvedValue({ authorized: true, statusCode: 200 });
            vi.mocked(mockRegistrationRepo.findById).mockResolvedValue(null);
            const uc = new CancelRegistrationUseCase(mockRegistrationRepo, mockUserAdminRepo, mockRuleRepo);
            await uc.execute({ token: 'valid', registrationId: 'reg-001' });
            expect(verifyPermission).toHaveBeenCalledWith('valid', 'UPDATE_COURSE', mockUserAdminRepo, mockRuleRepo);
        });
    });

    describe('verificação da inscrição', () => {
        beforeEach(() => {
            vi.mocked(verifyPermission).mockResolvedValue({ authorized: true, statusCode: 200 });
        });

        it('falha se inscrição não existir', async () => {
            vi.mocked(mockRegistrationRepo.findById).mockResolvedValue(null);
            const uc = new CancelRegistrationUseCase(mockRegistrationRepo, mockUserAdminRepo, mockRuleRepo);
            const result = await uc.execute({ token: 'valid', registrationId: 'reg-inexistente' });
            expect(result.success).toBe(false);
            expect(result.error?.message).toBe('Registration not found');
        });

        it('falha se deleção retornar false', async () => {
            vi.mocked(mockRegistrationRepo.findById).mockResolvedValue({ id: 'reg-001' } as any);
            vi.mocked(mockRegistrationRepo.delete).mockResolvedValue(false);
            const uc = new CancelRegistrationUseCase(mockRegistrationRepo, mockUserAdminRepo, mockRuleRepo);
            const result = await uc.execute({ token: 'valid', registrationId: 'reg-001' });
            expect(result.success).toBe(false);
            expect(result.error?.message).toBe('Failed to cancel registration');
        });
    });

    describe('cancelamento bem-sucedido', () => {
        it('retorna success true ao cancelar inscrição válida', async () => {
            vi.mocked(verifyPermission).mockResolvedValue({ authorized: true, statusCode: 200 });
            vi.mocked(mockRegistrationRepo.findById).mockResolvedValue({ id: 'reg-001' } as any);
            vi.mocked(mockRegistrationRepo.delete).mockResolvedValue(true);
            const uc = new CancelRegistrationUseCase(mockRegistrationRepo, mockUserAdminRepo, mockRuleRepo);
            const result = await uc.execute({ token: 'valid', registrationId: 'reg-001' });
            expect(result.success).toBe(true);
        });
    });
});
