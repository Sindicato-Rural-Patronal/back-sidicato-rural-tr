import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UpdateCourseUseCase } from '../update-course.js';
import { COURSE_END_BEFORE_START } from '../create-course.js';
import type { CourseRepository } from '../../ports/external/course-repository.js';
import type { RoomRepository } from '../../ports/external/room-repository.js';

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
    findById: vi.fn(),
    findAll: vi.fn(),
    update: vi.fn(),
    updateInRoom: vi.fn(),
    delete: vi.fn(),
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
            vi.mocked(mockCourseRepo.updateInRoom).mockResolvedValue({ conflict: CONFLICT });
            const uc = new UpdateCourseUseCase(mockCourseRepo, mockRoomRepo);
            const result = await uc.execute({
                courseId: 'course-001',
                roomId: '123e4567-e89b-12d3-a456-426614174000',
            });
            expect(result.error).toBeDefined();
            expect(result.error?.message).toBe('Sala ocupada: Reunião "Diretoria" em 01/07 09:00–10:00');
        });
    });

    describe('sala e horário', () => {
        beforeEach(() => {
            vi.mocked(mockCourseRepo.findById).mockResolvedValue(existingCourse as any);
        });

        it('mudou o horário: grava pela escrita que trava e confere a sala, sem o próprio curso', async () => {
            vi.mocked(mockCourseRepo.updateInRoom).mockResolvedValue({ result: { id: 'course-001' } } as any);
            const result = await new UpdateCourseUseCase(mockCourseRepo, mockRoomRepo).execute({
                courseId: 'course-001',
                endTime: '2026-07-01T17:00:00.000Z',
            });
            expect(result.error).toBeUndefined();
            expect(mockCourseRepo.updateInRoom).toHaveBeenCalledWith(
                'course-001',
                expect.objectContaining({ endTime: new Date('2026-07-01T17:00:00.000Z') }),
                { roomId: 'room-001',
startTime: existingCourse.startTime,
endTime: new Date('2026-07-01T17:00:00.000Z') },
            );
            expect(mockCourseRepo.update).not.toHaveBeenCalled();
        });

        it('sem mudar sala nem horário: edição simples, sem trava', async () => {
            vi.mocked(mockCourseRepo.update).mockResolvedValue({ id: 'course-001' } as any);
            await new UpdateCourseUseCase(mockCourseRepo, mockRoomRepo).execute({ courseId: 'course-001',
name: 'Outro' });
            expect(mockCourseRepo.updateInRoom).not.toHaveBeenCalled();
        });

        it.each([
            ['término antes do início', { endTime: '2026-07-01T07:00:00.000Z' }],
            ['início depois do término', { startTime: '2026-07-01T13:00:00.000Z' }],
            ['término igual ao início', { startTime: '2026-07-01T09:00:00.000Z',
endTime: '2026-07-01T09:00:00.000Z' }],
        ])('recusa %s, contando o valor que já estava gravado', async (_caso, body) => {
            const result = await new UpdateCourseUseCase(mockCourseRepo, mockRoomRepo).execute({ courseId: 'course-001',
...body });
            expect(result.error?.name).toBe('ValidationError');
            expect(result.error?.message).toBe(COURSE_END_BEFORE_START);
            expect(mockCourseRepo.updateInRoom).not.toHaveBeenCalled();
            expect(mockCourseRepo.update).not.toHaveBeenCalled();
        });

        it('curso antigo com datas trocadas continua editável no que não é data', async () => {
            vi.mocked(mockCourseRepo.findById).mockResolvedValue({ ...existingCourse,
endTime: new Date('2026-06-30T12:00:00Z') } as any);
            vi.mocked(mockCourseRepo.update).mockResolvedValue({ id: 'course-001' } as any);
            const result = await new UpdateCourseUseCase(mockCourseRepo, mockRoomRepo).execute({ courseId: 'course-001',
status: 'PRIVATE' });
            expect(result.error).toBeUndefined();
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

        it('não conclui pela edição um curso que não está em andamento', async () => {
            vi.mocked(mockCourseRepo.findById).mockResolvedValue({ ...existingCourse,
status: 'PUBLIC' } as any);
            const uc = new UpdateCourseUseCase(mockCourseRepo, mockRoomRepo);
            const result = await uc.execute({ courseId: 'course-001',
status: 'COMPLETED' });
            expect(result.error?.message).toBe('Só é possível concluir um curso que está em andamento.');
            expect(mockCourseRepo.update).not.toHaveBeenCalled();
        });

        it('aceita concluir e desfazer a conclusão pela edição', async () => {
            vi.mocked(mockCourseRepo.findById).mockResolvedValue({ ...existingCourse,
status: 'IN_PROGRESS' } as any);
            vi.mocked(mockCourseRepo.update).mockResolvedValue({ id: 'course-001' } as any);
            const uc = new UpdateCourseUseCase(mockCourseRepo, mockRoomRepo);
            for (const status of ['COMPLETED', 'IN_PROGRESS'] as const) {
                const result = await uc.execute({ courseId: 'course-001',
status });
                expect(result.error).toBeUndefined();
                expect(mockCourseRepo.update).toHaveBeenLastCalledWith('course-001', expect.objectContaining({ status }));
            }
        });

        it('falha se repositório retornar null na atualização', async () => {
            vi.mocked(mockCourseRepo.findById).mockResolvedValue(existingCourse as any);
            vi.mocked(mockCourseRepo.update).mockResolvedValue(null);
            const uc = new UpdateCourseUseCase(mockCourseRepo, mockRoomRepo);
            const result = await uc.execute({ courseId: 'course-001',
name: 'Novo Nome' });
            expect(result.error).toBeDefined();
            expect(result.error?.message).toBe('Course not found');
        });
    });
});
