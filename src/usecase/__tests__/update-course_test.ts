import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UpdateCourseUseCase } from '../update-course.js';
import type { CourseRepository } from '../../ports/external/course-repository.js';
import type { RoomRepository } from '../../ports/external/room-repository.js';

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

const existingCourse = {
    id: 'course-001',
    roomId: 'room-001',
    startTime: new Date('2026-07-01T08:00:00Z'),
    endTime: new Date('2026-07-01T12:00:00Z'),
};

describe('UpdateCourseUseCase', () => {
    beforeEach(() => vi.clearAllMocks());

    describe('verificação do curso', () => {
        it('falha se curso não existir', async () => {
            vi.mocked(mockCourseRepo.findById).mockResolvedValue(null);
            const uc = new UpdateCourseUseCase(mockCourseRepo, mockRoomRepo);
            const result = await uc.execute({ courseId: 'course-inexistente' });
            expect(result.error).toBeDefined();
            expect(result.error?.message).toBe('Course not found');
        });
    });

    describe('validação de sala ao alterar roomId', () => {
        beforeEach(() => {
            vi.mocked(mockCourseRepo.findById).mockResolvedValue(existingCourse as any);
        });

        it('falha se nova sala não existir', async () => {
            vi.mocked(mockRoomRepo.findById).mockResolvedValue(null);
            const uc = new UpdateCourseUseCase(mockCourseRepo, mockRoomRepo);
            const result = await uc.execute({
                courseId: 'course-001',
                roomId: '123e4567-e89b-12d3-a456-426614174000',
            });
            expect(result.error).toBeDefined();
            expect(result.error?.message).toBe('Room not found');
        });

        it('falha se nova sala já estiver ocupada no período', async () => {
            vi.mocked(mockRoomRepo.findById).mockResolvedValue({ id: 'room-002' } as any);
            vi.mocked(mockCourseRepo.isRoomAvailable).mockResolvedValue(false);
            const uc = new UpdateCourseUseCase(mockCourseRepo, mockRoomRepo);
            const result = await uc.execute({
                courseId: 'course-001',
                roomId: '123e4567-e89b-12d3-a456-426614174000',
            });
            expect(result.error).toBeDefined();
            expect(result.error?.message).toBe('Room is already booked for this period');
        });
    });

    describe('atualização bem-sucedida', () => {
        it('retorna success true ao atualizar nome sem mudar sala', async () => {
            vi.mocked(mockCourseRepo.findById).mockResolvedValue(existingCourse as any);
            vi.mocked(mockCourseRepo.update).mockResolvedValue({ id: 'course-001' } as any);
            const uc = new UpdateCourseUseCase(mockCourseRepo, mockRoomRepo);
            const result = await uc.execute({ courseId: 'course-001',
name: 'Novo Nome' });
            expect(result.error).toBeUndefined();
        });

        it('falha se repositório retornar null na atualização', async () => {
            vi.mocked(mockCourseRepo.findById).mockResolvedValue(existingCourse as any);
            vi.mocked(mockCourseRepo.update).mockResolvedValue(null);
            const uc = new UpdateCourseUseCase(mockCourseRepo, mockRoomRepo);
            const result = await uc.execute({ courseId: 'course-001',
name: 'Novo Nome' });
            expect(result.error).toBeDefined();
            expect(result.error?.message).toBe('Failed to update course');
        });
    });
});
