import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListAllCoursesUseCase } from '../list-all-courses.js';
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
    count: vi.fn().mockResolvedValue(0),
    update: vi.fn(),
    delete: vi.fn(),
    isRoomAvailable: vi.fn(),
    addPhoto: vi.fn(),
    deletePhoto: vi.fn(),
} as unknown as CourseRepository;

const mockUserAdminRepo = {} as unknown as UserAdminRepository;
const mockRuleRepo = {} as unknown as RuleRepository;

describe('ListAllCoursesUseCase', () => {
    beforeEach(() => vi.clearAllMocks());

    describe('autenticação e permissão', () => {
        it('falha se sem permissão READ_COURSE', async () => {
            vi.mocked(verifyPermission).mockResolvedValue({ authorized: false, statusCode: 403, error: 'Permission denied' });
            const uc = new ListAllCoursesUseCase(mockCourseRepo, mockUserAdminRepo, mockRuleRepo);
            const result = await uc.execute('bad-token');
            expect(result.success).toBe(false);
            expect(result.statusCode).toBe(403);
        });
    });

    describe('listagem com acesso autorizado', () => {
        it('retorna todos os cursos sem filtro de status', async () => {
            vi.mocked(verifyPermission).mockResolvedValue({ authorized: true, statusCode: 200 });
            vi.mocked(mockCourseRepo.findAll).mockResolvedValue([]);
            const uc = new ListAllCoursesUseCase(mockCourseRepo, mockUserAdminRepo, mockRuleRepo);
            await uc.execute('valid-token');
            expect(mockCourseRepo.findAll).toHaveBeenCalledWith(undefined, 0, 20);
        });

        it('retorna lista vazia quando não há cursos', async () => {
            vi.mocked(verifyPermission).mockResolvedValue({ authorized: true, statusCode: 200 });
            vi.mocked(mockCourseRepo.findAll).mockResolvedValue([]);
            const uc = new ListAllCoursesUseCase(mockCourseRepo, mockUserAdminRepo, mockRuleRepo);
            const result = await uc.execute('valid-token');
            expect(result.success).toBe(true);
            expect(result.result?.data).toHaveLength(0);
        });
    });
});
