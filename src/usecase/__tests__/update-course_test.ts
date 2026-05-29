import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UpdateCourseUseCase } from '../update-course.js';
import type { CourseRepository } from '../../ports/external/course-repository.js';
import type { RoomRepository } from '../../ports/external/room-repository.js';
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

const mockRoomRepo = {
    create: vi.fn(),
    findById: vi.fn(),
    findAll: vi.fn(),
    delete: vi.fn(),
} as unknown as RoomRepository;

const mockUserAdminRepo = {} as unknown as UserAdminRepository;
const mockRuleRepo = {} as unknown as RuleRepository;

const existingCourse = {
    id: 'course-001',
    roomId: 'room-001',
    startTime: new Date('2026-07-01T08:00:00Z'),
    endTime: new Date('2026-07-01T12:00:00Z'),
};

describe('UpdateCourseUseCase', () => {
    beforeEach(() => vi.clearAllMocks());

    describe('autenticação e permissão', () => {
        it('falha se token inválido', async () => {
            vi.mocked(verifyPermission).mockResolvedValue({ authorized: false, statusCode: 401, error: 'Invalid or expired token' });
            const uc = new UpdateCourseUseCase(mockCourseRepo, mockRoomRepo, mockUserAdminRepo, mockRuleRepo);
            const result = await uc.execute({ courseId: 'course-001', token: 'bad' });
            expect(result.success).toBe(false);
            expect(result.statusCode).toBe(401);
        });
    });

    describe('verificação do curso', () => {
        beforeEach(() => {
            vi.mocked(verifyPermission).mockResolvedValue({ authorized: true, statusCode: 200 });
        });

        it('falha se curso não existir', async () => {
            vi.mocked(mockCourseRepo.findById).mockResolvedValue(null);
            const uc = new UpdateCourseUseCase(mockCourseRepo, mockRoomRepo, mockUserAdminRepo, mockRuleRepo);
            const result = await uc.execute({ courseId: 'course-inexistente', token: 'valid' });
            expect(result.success).toBe(false);
            expect(result.error?.message).toBe('Course not found');
        });
    });

    describe('validação de sala ao alterar roomId', () => {
        beforeEach(() => {
            vi.mocked(verifyPermission).mockResolvedValue({ authorized: true, statusCode: 200 });
            vi.mocked(mockCourseRepo.findById).mockResolvedValue(existingCourse as any);
        });

        it('falha se nova sala não existir', async () => {
            vi.mocked(mockRoomRepo.findById).mockResolvedValue(null);
            const uc = new UpdateCourseUseCase(mockCourseRepo, mockRoomRepo, mockUserAdminRepo, mockRuleRepo);
            const result = await uc.execute({
                courseId: 'course-001',
                token: 'valid',
                roomId: '123e4567-e89b-12d3-a456-426614174000',
            });
            expect(result.success).toBe(false);
            expect(result.error?.message).toBe('Room not found');
        });

        it('falha se nova sala já estiver ocupada no período', async () => {
            vi.mocked(mockRoomRepo.findById).mockResolvedValue({ id: 'room-002' } as any);
            vi.mocked(mockCourseRepo.isRoomAvailable).mockResolvedValue(false);
            const uc = new UpdateCourseUseCase(mockCourseRepo, mockRoomRepo, mockUserAdminRepo, mockRuleRepo);
            const result = await uc.execute({
                courseId: 'course-001',
                token: 'valid',
                roomId: '123e4567-e89b-12d3-a456-426614174000',
            });
            expect(result.success).toBe(false);
            expect(result.error?.message).toBe('Room is already booked for this period');
        });
    });

    describe('atualização bem-sucedida', () => {
        it('retorna success true ao atualizar nome sem mudar sala', async () => {
            vi.mocked(verifyPermission).mockResolvedValue({ authorized: true, statusCode: 200 });
            vi.mocked(mockCourseRepo.findById).mockResolvedValue(existingCourse as any);
            vi.mocked(mockCourseRepo.update).mockResolvedValue({ id: 'course-001' } as any);
            const uc = new UpdateCourseUseCase(mockCourseRepo, mockRoomRepo, mockUserAdminRepo, mockRuleRepo);
            const result = await uc.execute({ courseId: 'course-001', token: 'valid', name: 'Novo Nome' });
            expect(result.success).toBe(true);
        });

        it('falha se repositório retornar null na atualização', async () => {
            vi.mocked(verifyPermission).mockResolvedValue({ authorized: true, statusCode: 200 });
            vi.mocked(mockCourseRepo.findById).mockResolvedValue(existingCourse as any);
            vi.mocked(mockCourseRepo.update).mockResolvedValue(null);
            const uc = new UpdateCourseUseCase(mockCourseRepo, mockRoomRepo, mockUserAdminRepo, mockRuleRepo);
            const result = await uc.execute({ courseId: 'course-001', token: 'valid', name: 'Novo Nome' });
            expect(result.success).toBe(false);
            expect(result.error?.message).toBe('Failed to update course');
        });
    });
});
