import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CourseRepository } from '../../ports/external/course-repository.js';
import type { UserDataRepository } from '../../ports/external/user-data-repository.js';
import type { RegistrationRepository } from '../../ports/external/registration-repository.js';
import type { NotificationPublisher } from '../../ports/external/notification-repository.js';
import { RegisterForCourseByCpfUseCase } from '../register-for-course-by-cpf.js';
import { CpfAttemptLimiter } from '../../lib/cpf-attempt-limiter.js';

const mockCourseRepo = { findById: vi.fn() } as unknown as CourseRepository;
const mockUserDataRepo = { findByCpf: vi.fn() } as unknown as UserDataRepository;
const mockRegistrationRepo = {
    createWithCapacity: vi.fn(),
    findByUserDataAndCourse: vi.fn(),
} as unknown as RegistrationRepository;
const mockPublisher = { publish: vi.fn() } as unknown as NotificationPublisher;

const courseId = '123e4567-e89b-12d3-a456-426614174000';
const input = { courseId,
cpf: '52998224725',
phoneEnd: '0001' };

const publishedCourse = {
    id: courseId,
    status: 'PUBLIC',
    name: 'Curso de Tratorista',
    endTime: new Date('2099-01-01T17:00:00.000Z'),
    registrationDeadline: null,
    room: { maxCapacity: 100 },
    _count: { courseUserRegistration: 0 },
};
const joao = { id: 'ud-001',
name: 'João Cadastrado',
phone: '(44) 99123-0001',
phone2: null,
phone3: null };

const build = () => new RegisterForCourseByCpfUseCase(mockCourseRepo, mockUserDataRepo, mockRegistrationRepo, mockPublisher, new CpfAttemptLimiter());

function succeed() {
    vi.mocked(mockCourseRepo.findById).mockResolvedValue(publishedCourse as any);
    vi.mocked(mockUserDataRepo.findByCpf).mockResolvedValue(joao as any);
    vi.mocked(mockRegistrationRepo.findByUserDataAndCourse).mockResolvedValue(null);
    vi.mocked(mockRegistrationRepo.createWithCapacity).mockResolvedValue({ id: 'reg-001' } as any);
}

describe('RegisterForCourseByCpfUseCase', () => {
    beforeEach(() => vi.clearAllMocks());

    it('CPF e final do telefone certos: inscreve e devolve os ids', async () => {
        succeed();
        const result = await build().execute(input);
        expect(result).toEqual({ registrationId: 'reg-001',
userDataId: 'ud-001' });
    });

    it('curso inexistente, não publicado ou terminado: recusa antes de procurar a pessoa', async () => {
        vi.mocked(mockCourseRepo.findById).mockResolvedValue(null);
        expect((await build().execute(input)).error?.message).toBe('Course not found');

        vi.mocked(mockCourseRepo.findById).mockResolvedValue({ ...publishedCourse,
status: 'UNPUBLISHED' } as any);
        expect((await build().execute(input)).error?.message).toBe('Registrations unavailable for this course');

        vi.mocked(mockCourseRepo.findById).mockResolvedValue({ ...publishedCourse,
endTime: new Date('2020-01-10T17:00:00.000Z') } as any);
        expect((await build().execute(input)).error?.message).toBe('Este curso já terminou e não aceita mais inscrições.');
        expect(mockUserDataRepo.findByCpf).not.toHaveBeenCalled();
    });

    it('telefone que não confere e CPF sem cadastro: o mesmo erro, nada criado', async () => {
        succeed();
        const wrong = await build().execute({ ...input,
phoneEnd: '9999' });
        vi.mocked(mockUserDataRepo.findByCpf).mockResolvedValue(null);
        const missing = await build().execute(input);
        expect(wrong.error?.message).toBe('Não encontramos cadastro com este CPF e telefone.');
        expect(missing.error?.message).toBe(wrong.error?.message);
        expect(mockRegistrationRepo.createWithCapacity).not.toHaveBeenCalled();
    });

    it('já inscrita → erro de duplicidade', async () => {
        succeed();
        vi.mocked(mockRegistrationRepo.findByUserDataAndCourse).mockResolvedValue({ id: 'reg-dup' } as any);
        expect((await build().execute(input)).error?.message).toBe('Esta pessoa já está inscrita neste curso.');
    });

    it('curso lotado → erro, e não publica', async () => {
        succeed();
        vi.mocked(mockRegistrationRepo.createWithCapacity).mockResolvedValue('FULL' as any);
        expect((await build().execute(input)).error?.message).toBe('Curso lotado — sem vagas disponíveis.');
        expect(mockPublisher.publish).not.toHaveBeenCalled();
    });

    it('publica a inscrição para quem tem READ_COURSE, com link para as inscrições do curso', async () => {
        succeed();
        await build().execute(input);
        expect(mockPublisher.publish).toHaveBeenCalledWith({
            type: 'COURSE_REGISTRATION',
            permission: 'READ_COURSE',
            title: 'Nova inscrição em Curso de Tratorista',
            body: 'João Cadastrado',
            link: `/admin/cursos?curso=${courseId}&aba=inscricoes`,
            entityId: 'reg-001',
        });
    });

    it('falha ao publicar não derruba a inscrição', async () => {
        succeed();
        vi.mocked(mockPublisher.publish).mockRejectedValueOnce(new Error('banco fora'));
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const result = await build().execute(input);
        expect(result.error).toBeUndefined();
        expect(result.registrationId).toBe('reg-001');
        spy.mockRestore();
    });
});
