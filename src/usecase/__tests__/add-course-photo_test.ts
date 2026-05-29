import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AddCoursePhotoUseCase } from '../add-course-photo.js';
import type { CourseRepository } from '../../ports/external/course-repository.js';
import type { StorageRepository } from '../../ports/external/storage-repository.js';
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

const mockStorage = {
    uploadFile: vi.fn(),
    getPublicUrl: vi.fn(),
    deleteFile: vi.fn(),
} as unknown as StorageRepository;

const mockUserAdminRepo = {} as unknown as UserAdminRepository;
const mockRuleRepo = {} as unknown as RuleRepository;

const fakeBuffer = Buffer.from('fake-image');

describe('AddCoursePhotoUseCase', () => {
    beforeEach(() => vi.clearAllMocks());

    describe('autenticação e permissão', () => {
        it('falha se sem permissão UPDATE_COURSE', async () => {
            vi.mocked(verifyPermission).mockResolvedValue({ authorized: false, statusCode: 403, error: 'Permission denied' });
            const uc = new AddCoursePhotoUseCase(mockCourseRepo, mockStorage, mockUserAdminRepo, mockRuleRepo);
            const result = await uc.execute('bad-token', 'course-001', fakeBuffer, 'foto.jpg');
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
            const uc = new AddCoursePhotoUseCase(mockCourseRepo, mockStorage, mockUserAdminRepo, mockRuleRepo);
            const result = await uc.execute('valid-token', 'course-inexistente', fakeBuffer, 'foto.jpg');
            expect(result.success).toBe(false);
            expect(result.error?.message).toBe('Course not found');
        });
    });

    describe('upload bem-sucedido', () => {
        it('faz upload e retorna url e photoId', async () => {
            vi.mocked(verifyPermission).mockResolvedValue({ authorized: true, statusCode: 200 });
            vi.mocked(mockCourseRepo.findById).mockResolvedValue({ id: 'course-001' } as any);
            vi.mocked(mockStorage.uploadFile).mockResolvedValue({ location: 'http://bucket/foto.jpg', key: 'foto.jpg', bucket: 'test-bucket' });
            vi.mocked(mockStorage.getPublicUrl).mockReturnValue('http://bucket/foto.jpg');
            vi.mocked(mockCourseRepo.addPhoto).mockResolvedValue({ id: 'photo-001' } as any);
            const uc = new AddCoursePhotoUseCase(mockCourseRepo, mockStorage, mockUserAdminRepo, mockRuleRepo);
            const result = await uc.execute('valid-token', 'course-001', fakeBuffer, 'foto.jpg', 'Legenda');
            expect(result.success).toBe(true);
            expect(result.url).toBe('http://bucket/foto.jpg');
            expect(result.photoId).toBe('photo-001');
        });
    });
});
