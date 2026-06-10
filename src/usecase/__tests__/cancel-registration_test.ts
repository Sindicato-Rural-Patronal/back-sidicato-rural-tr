import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CancelRegistrationUseCase } from '../cancel-registration.js';
import type { RegistrationRepository } from '../../ports/external/registration-repository.js';

const mockRegistrationRepo = {
    create: vi.fn(),
    findById: vi.fn(),
    findByCourseId: vi.fn(),
    findByUserDataAndCourse: vi.fn(),
    delete: vi.fn(),
} as unknown as RegistrationRepository;

describe('CancelRegistrationUseCase', () => {
    beforeEach(() => vi.clearAllMocks());

    describe('verificação da inscrição', () => {
        it('falha se inscrição não existir', async () => {
            vi.mocked(mockRegistrationRepo.findById).mockResolvedValue(null);
            const uc = new CancelRegistrationUseCase(mockRegistrationRepo);
            const result = await uc.execute('reg-inexistente');
            expect(result.error).toBeDefined();
            expect(result.error?.message).toBe('Registration not found');
        });

        it('falha se deleção retornar false', async () => {
            vi.mocked(mockRegistrationRepo.findById).mockResolvedValue({ id: 'reg-001' } as any);
            vi.mocked(mockRegistrationRepo.delete).mockResolvedValue(false);
            const uc = new CancelRegistrationUseCase(mockRegistrationRepo);
            const result = await uc.execute('reg-001');
            expect(result.error).toBeDefined();
            expect(result.error?.message).toBe('Failed to cancel registration');
        });
    });

    describe('cancelamento bem-sucedido', () => {
        it('retorna success true ao cancelar inscrição válida', async () => {
            vi.mocked(mockRegistrationRepo.findById).mockResolvedValue({ id: 'reg-001' } as any);
            vi.mocked(mockRegistrationRepo.delete).mockResolvedValue(true);
            const uc = new CancelRegistrationUseCase(mockRegistrationRepo);
            const result = await uc.execute('reg-001');
            expect(result.error).toBeUndefined();
        });
    });
});
