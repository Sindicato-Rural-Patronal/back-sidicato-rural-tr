import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateCourseUseCase } from '../create-course.js';
import type { CourseRepository } from '../../ports/external/course-repository.js';
import type { RoomRepository } from '../../ports/external/room-repository.js';
import { CURSO_SEM_NOME } from '../../lib/course-name.js';

// Reunião que já ocupa a sala (curso e reservas dividem a agenda).
const CONFLICT = {
    kind: 'MEETING' as const,
    id: 'booking-1',
    title: 'Diretoria',
    startTime: new Date('2026-07-01T09:00:00.000Z'),
    endTime: new Date('2026-07-01T10:00:00.000Z'),
};

const mockCourseRepo = {
    create: vi.fn(),
    findRoomConflict: vi.fn(),
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
        it('nome vazio nao e erro: vira o nome generico', async () => {
            // O cadastro do curso costuma comecar pela sala e pelas datas, para
            // ja reservar a agenda; o titulo vem depois.
            vi.mocked(mockRoomRepo.findById).mockResolvedValue({ id: validInput.roomId } as never);
            vi.mocked(mockCourseRepo.findRoomConflict).mockResolvedValue(null);
            vi.mocked(mockCourseRepo.create).mockResolvedValue({ id: 'curso-1' } as never);
            const uc = new CreateCourseUseCase(mockCourseRepo, mockRoomRepo);
            const result = await uc.execute({ ...validInput,
name: '   ' });
            expect(result.error).toBeUndefined();
            expect(mockCourseRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({ name: CURSO_SEM_NOME }),
            );
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
            vi.mocked(mockCourseRepo.findRoomConflict).mockResolvedValue(CONFLICT);
            const uc = new CreateCourseUseCase(mockCourseRepo, mockRoomRepo);
            const result = await uc.execute(validInput);
            expect(result.error).toBeDefined();
            expect(result.error?.message).toBe('Sala ocupada: Reunião "Diretoria" em 01/07 09:00–10:00');
        });
    });

    describe('criação bem-sucedida', () => {
        it('retorna courseId ao criar curso válido', async () => {
            vi.mocked(mockRoomRepo.findById).mockResolvedValue({ id: validInput.roomId } as any);
            vi.mocked(mockCourseRepo.findRoomConflict).mockResolvedValue(null);
            vi.mocked(mockCourseRepo.create).mockResolvedValue({ id: 'course-abc' } as any);
            const uc = new CreateCourseUseCase(mockCourseRepo, mockRoomRepo);
            const result = await uc.execute(validInput);
            expect(result.error).toBeUndefined();
            expect(result.courseId).toBe('course-abc');
        });

        it('grava nº do evento e mínimo de alunos informados na criação', async () => {
            vi.mocked(mockRoomRepo.findById).mockResolvedValue({ id: validInput.roomId } as any);
            vi.mocked(mockCourseRepo.findRoomConflict).mockResolvedValue(null);
            vi.mocked(mockCourseRepo.create).mockResolvedValue({ id: 'course-abc' } as any);
            const uc = new CreateCourseUseCase(mockCourseRepo, mockRoomRepo);
            await uc.execute({ ...validInput,
eventNumber: '261676',
minStudents: 8 });
            expect(mockCourseRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({ eventNumber: '261676',
minStudents: 8 }),
            );
        });

        it('falha se repositório retornar null na criação', async () => {
            vi.mocked(mockRoomRepo.findById).mockResolvedValue({ id: validInput.roomId } as any);
            vi.mocked(mockCourseRepo.findRoomConflict).mockResolvedValue(null);
            vi.mocked(mockCourseRepo.create).mockResolvedValue(null as any);
            const uc = new CreateCourseUseCase(mockCourseRepo, mockRoomRepo);
            const result = await uc.execute(validInput);
            expect(result.error).toBeDefined();
            expect(result.error?.message).toBe('Failed to create course');
        });
    });
});
