import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListCourseRegistrationsUseCase } from '../list-course-registrations.js';
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

describe('ListCourseRegistrationsUseCase', () => {
    beforeEach(() => vi.clearAllMocks());

    describe('autenticação e permissão', () => {
        it('falha se sem permissão READ_COURSE', async () => {
            vi.mocked(verifyPermission).mockResolvedValue({ authorized: false, statusCode: 401, error: 'Unauthorized' });
            const uc = new ListCourseRegistrationsUseCase(mockRegistrationRepo, mockUserAdminRepo, mockRuleRepo);
            const result = await uc.execute({ token: 'bad', courseId: 'course-001' });
            expect(result.success).toBe(false);
            expect(result.statusCode).toBe(401);
        });
    });

    describe('listagem de inscrições', () => {
        it('retorna inscrições do curso', async () => {
            vi.mocked(verifyPermission).mockResolvedValue({ authorized: true, statusCode: 200 });
            const fakeRegs = [{ id: 'reg-001', userData: { name: 'João' } }];
            vi.mocked(mockRegistrationRepo.findByCourseId).mockResolvedValue(fakeRegs as any);
            const uc = new ListCourseRegistrationsUseCase(mockRegistrationRepo, mockUserAdminRepo, mockRuleRepo);
            const result = await uc.execute({ token: 'valid', courseId: 'course-001' });
            expect(result.success).toBe(true);
            expect(result.registrations).toHaveLength(1);
        });

        it('retorna lista vazia se não há inscrições', async () => {
            vi.mocked(verifyPermission).mockResolvedValue({ authorized: true, statusCode: 200 });
            vi.mocked(mockRegistrationRepo.findByCourseId).mockResolvedValue([]);
            const uc = new ListCourseRegistrationsUseCase(mockRegistrationRepo, mockUserAdminRepo, mockRuleRepo);
            const result = await uc.execute({ token: 'valid', courseId: 'course-001' });
            expect(result.registrations).toHaveLength(0);
        });
    });
});
