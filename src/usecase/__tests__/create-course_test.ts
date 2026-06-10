import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateCourseUseCase } from '../create-course.js';
import type { CourseRepository } from '../../ports/external/course-repository.js';
import type { RoomRepository } from '../../ports/external/room-repository.js';

const mockCourseRepo = {
    create: vi.fn(),
    isRoomAvailable: vi.fn(),
    findById: vi.fn(),
    findAll: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    addPhoto: vi.fn(),
    deletePhoto: vi.fn(),
} as unknown as CourseRepository;

const mockRoomRepo = {
    findById: vi.fn(),
    create: vi.fn(),
    findAll: vi.fn(),
    delete: vi.fn(),
} as unknown as RoomRepository;

const validInput = {
    name: 'Curso de Segurança no Trabalho',
    description: 'Treinamento obrigatório',
    roomId: '123e4567-e89b-12d3-a456-426614174000',
    startTime: '2026-07-01T08:00:00.000Z',
    endTime: '2026-07-01T12:00:00.000Z',
};

describe('CreateCourseUseCase', () => {
    beforeEach(() => vi.clearAllMocks());

    describe('validação de input', () => {
        it('falha se nome estiver vazio', async () => {
            const uc = new CreateCourseUseCase(mockCourseRepo, mockRoomRepo);
            const result = await uc.execute({ ...validInput,
name: '' });
            expect(result.error).toBeDefined();
            expect(result.error?.message).toContain('Course name is required');
        });

        it('falha se roomId não for UUID válido', async () => {
            const uc = new CreateCourseUseCase(mockCourseRepo, mockRoomRepo);
            const result = await uc.execute({ ...validInput,
roomId: 'nao-e-uuid' });
            expect(result.error).toBeDefined();
            expect(result.error).toBeDefined();
        });
    });

    describe('validação de sala', () => {
        it('falha se sala não existe', async () => {
            vi.mocked(mockRoomRepo.findById).mockResolvedValue(null);
            const uc = new CreateCourseUseCase(mockCourseRepo, mockRoomRepo);
            const result = await uc.execute(validInput);
            expect(result.error).toBeDefined();
            expect(result.error?.message).toBe('Room not found');
        });

        it('falha se sala já ocupada no período', async () => {
            vi.mocked(mockRoomRepo.findById).mockResolvedValue({ id: validInput.roomId } as any);
            vi.mocked(mockCourseRepo.isRoomAvailable).mockResolvedValue(false);
            const uc = new CreateCourseUseCase(mockCourseRepo, mockRoomRepo);
            const result = await uc.execute(validInput);
            expect(result.error).toBeDefined();
            expect(result.error?.message).toBe('Room is already booked for this period');
        });
    });

    describe('criação bem-sucedida', () => {
        it('retorna courseId ao criar curso válido', async () => {
            vi.mocked(mockRoomRepo.findById).mockResolvedValue({ id: validInput.roomId } as any);
            vi.mocked(mockCourseRepo.isRoomAvailable).mockResolvedValue(true);
            vi.mocked(mockCourseRepo.create).mockResolvedValue({ id: 'course-abc' } as any);
            const uc = new CreateCourseUseCase(mockCourseRepo, mockRoomRepo);
            const result = await uc.execute(validInput);
            expect(result.error).toBeUndefined();
            expect(result.courseId).toBe('course-abc');
        });

        it('falha se repositório retornar null na criação', async () => {
            vi.mocked(mockRoomRepo.findById).mockResolvedValue({ id: validInput.roomId } as any);
            vi.mocked(mockCourseRepo.isRoomAvailable).mockResolvedValue(true);
            vi.mocked(mockCourseRepo.create).mockResolvedValue(null as any);
            const uc = new CreateCourseUseCase(mockCourseRepo, mockRoomRepo);
            const result = await uc.execute(validInput);
            expect(result.error).toBeDefined();
            expect(result.error?.message).toBe('Failed to create course');
        });
    });
});
