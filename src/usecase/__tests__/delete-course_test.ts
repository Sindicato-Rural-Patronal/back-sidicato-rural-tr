import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeleteCourseUseCase } from '../delete-course.js';
import type { CourseRepository } from '../../ports/external/course-repository.js';
import type { UserAdminRepository } from '../../ports/external/user-admin-repository.js';
import type { RuleRepository } from '../../ports/external/rule-repository.js';

vi.mock('../../lib/verify-permission.js', () => ({
    verifyPermission: vi.fn(),
}));

import { verifyPermission } from '../../lib/verify-permission.js';

const mockCourseRepo = {
    create: vi.fn(),
    findById: vi.fn(),
    findAll: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    isRoomAvailable: vi.fn(),
    addPhoto: vi.fn(),
    deletePhoto: vi.fn(),
} as unknown as CourseRepository;

const mockUserAdminRepo = {} as unknown as UserAdminRepository;
const mockRuleRepo = {} as unknown as RuleRepository;

describe('DeleteCourseUseCase', () => {
    beforeEach(() => vi.clearAllMocks());

    describe('autenticação e permissão', () => {
        it('falha se sem permissão DELETE_COURSE', async () => {
            vi.mocked(verifyPermission).mockResolvedValue({ authorized: false, statusCode: 403, error: 'Permission denied' });
            const uc = new DeleteCourseUseCase(mockCourseRepo, mockUserAdminRepo, mockRuleRepo);
            const result = await uc.execute('valid-token', 'course-001');
            expect(result.success).toBe(false);
            expect(result.statusCode).toBe(403);
        });
    });

    describe('verificação do curso', () => {
        beforeEach(() => {
            vi.mocked(verifyPermission).mockResolvedValue({ authorized: true, statusCode: 200 });
        });

        it('falha se curso não existir', async () => {
            vi.mocked(mockCourseRepo.findById).mockResolvedValue(null);
            const uc = new DeleteCourseUseCase(mockCourseRepo, mockUserAdminRepo, mockRuleRepo);
            const result = await uc.execute('valid-token', 'course-inexistente');
            expect(result.success).toBe(false);
            expect(result.error?.message).toBe('Course not found');
        });

        it('falha se deleção retornar false', async () => {
            vi.mocked(mockCourseRepo.findById).mockResolvedValue({ id: 'course-001' } as any);
            vi.mocked(mockCourseRepo.delete).mockResolvedValue(false);
            const uc = new DeleteCourseUseCase(mockCourseRepo, mockUserAdminRepo, mockRuleRepo);
            const result = await uc.execute('valid-token', 'course-001');
            expect(result.success).toBe(false);
            expect(result.error?.message).toBe('Failed to delete course');
        });
    });

    describe('deleção bem-sucedida', () => {
        it('retorna success true ao deletar curso válido', async () => {
            vi.mocked(verifyPermission).mockResolvedValue({ authorized: true, statusCode: 200 });
            vi.mocked(mockCourseRepo.findById).mockResolvedValue({ id: 'course-001' } as any);
            vi.mocked(mockCourseRepo.delete).mockResolvedValue(true);
            const uc = new DeleteCourseUseCase(mockCourseRepo, mockUserAdminRepo, mockRuleRepo);
            const result = await uc.execute('valid-token', 'course-001');
            expect(result.success).toBe(true);
        });
    });
});
