import { describe, it, expect, vi, beforeEach } from 'vitest';
import { COURSE_END_BEFORE_START, CreateCourseUseCase } from '../create-course.js';
import type { CourseRepository } from '../../ports/external/course-repository.js';
import type { RoomRepository } from '../../ports/external/room-repository.js';
import '../../lib/zod-config.js';
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
    createInRoom: vi.fn(),
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
            vi.mocked(mockCourseRepo.createInRoom).mockResolvedValue({ result: { id: 'curso-1' } } as never);
            const uc = new CreateCourseUseCase(mockCourseRepo, mockRoomRepo);
            const result = await uc.execute({ ...validInput,
name: '   ' });
            expect(result.error).toBeUndefined();
            expect(mockCourseRepo.createInRoom).toHaveBeenCalledWith(
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

    describe('mensagens em português', () => {
        it.each([
            ['descrição vazia', { description: '' }, 'Informe a descrição do curso.'],
            ['sala que não é UUID', { roomId: 'nao-e-uuid' }, 'Escolha uma sala válida.'],
        ])('%s', async (_caso, over, message) => {
            const result = await new CreateCourseUseCase(mockCourseRepo, mockRoomRepo).execute({ ...validInput,
...over });
            expect(result.error?.name).toBe('ValidationError');
            expect(result.error?.message).toBe(message);
        });

        it('campo que não veio sai em português, sem "undefined"', async () => {
            const { description: _omit, ...semDescricao } = validInput;
            const result = await new CreateCourseUseCase(mockCourseRepo, mockRoomRepo).execute(semDescricao as never);
            expect(result.error?.message).toBe('Informe o campo description.');
        });
    });

    describe('término depois do início', () => {
        it.each([
            ['término antes do início', '2026-07-01T12:00:00.000Z', '2026-07-01T08:00:00.000Z'],
            ['término igual ao início', '2026-07-01T08:00:00.000Z', '2026-07-01T08:00:00.000Z'],
        ])('recusa %s, sem gravar', async (_caso, startTime, endTime) => {
            const result = await new CreateCourseUseCase(mockCourseRepo, mockRoomRepo).execute({ ...validInput,
startTime,
endTime });
            expect(result.error?.name).toBe('ValidationError');
            expect(result.error?.message).toBe(COURSE_END_BEFORE_START);
            expect(mockCourseRepo.createInRoom).not.toHaveBeenCalled();
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
            vi.mocked(mockCourseRepo.createInRoom).mockResolvedValue({ conflict: CONFLICT });
            const uc = new CreateCourseUseCase(mockCourseRepo, mockRoomRepo);
            const result = await uc.execute(validInput);
            expect(result.error).toBeDefined();
            expect(result.error?.message).toBe('Sala ocupada: Reunião "Diretoria" em 01/07 09:00–10:00');
        });
    });

    describe('criação bem-sucedida', () => {
        it('retorna courseId ao criar curso válido', async () => {
            vi.mocked(mockRoomRepo.findById).mockResolvedValue({ id: validInput.roomId } as any);
            vi.mocked(mockCourseRepo.createInRoom).mockResolvedValue({ result: { id: 'course-abc' } } as any);
            const uc = new CreateCourseUseCase(mockCourseRepo, mockRoomRepo);
            const result = await uc.execute(validInput);
            expect(result.error).toBeUndefined();
            expect(result.courseId).toBe('course-abc');
        });

        it('grava nº do evento e mínimo de alunos informados na criação', async () => {
            vi.mocked(mockRoomRepo.findById).mockResolvedValue({ id: validInput.roomId } as any);
            vi.mocked(mockCourseRepo.createInRoom).mockResolvedValue({ result: { id: 'course-abc' } } as any);
            const uc = new CreateCourseUseCase(mockCourseRepo, mockRoomRepo);
            await uc.execute({ ...validInput,
eventNumber: '261676',
minStudents: 8 });
            expect(mockCourseRepo.createInRoom).toHaveBeenCalledWith(
                expect.objectContaining({ eventNumber: '261676',
minStudents: 8 }),
            );
        });

        // A checagem e a gravação são uma chamada só (sala travada no adapter):
        // não existe mais um "confere, depois grava" separado no use case.
        it('passa sala e horário para a gravação que confere a sala', async () => {
            vi.mocked(mockRoomRepo.findById).mockResolvedValue({ id: validInput.roomId } as any);
            vi.mocked(mockCourseRepo.createInRoom).mockResolvedValue({ result: { id: 'course-abc' } } as any);
            await new CreateCourseUseCase(mockCourseRepo, mockRoomRepo).execute(validInput);
            expect(mockCourseRepo.createInRoom).toHaveBeenCalledWith(expect.objectContaining({
                roomId: validInput.roomId,
                startTime: new Date(validInput.startTime),
                endTime: new Date(validInput.endTime),
            }));
        });
    });
});
