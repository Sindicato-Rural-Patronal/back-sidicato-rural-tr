import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    AdminRegisterPersonUseCase,
    ConfirmAllRegistrationsUseCase,
    PersonAlreadyRegisteredError,
} from '../admin-course-registrations.js';
import type { CourseRepository } from '../../ports/external/course-repository.js';
import type { UserDataRepository } from '../../ports/external/user-data-repository.js';
import type { RegistrationRepository } from '../../ports/external/registration-repository.js';
import { CourseFullError } from '../../errors/business-rule.js';
import { CourseNotFoundError, UserDataNotFoundError } from '../../errors/not-found.js';
import { ConflictError } from '../../errors/conflict.js';

const courseRepo = { findById: vi.fn() } as unknown as CourseRepository;
const userDataRepo = { findById: vi.fn() } as unknown as UserDataRepository;
const registrationRepo = {
    findByUserDataAndCourse: vi.fn(),
    createWithCapacity: vi.fn(),
    confirmAll: vi.fn(),
} as unknown as RegistrationRepository;

// Curso que a inscrição pública recusaria (rascunho, prazo e fim no passado).
const closedCourse = {
    id: 'course-1',
    status: 'UNPUBLISHED',
    registrationDeadline: new Date('2020-01-01T00:00:00Z'),
    endTime: new Date('2020-01-02T00:00:00Z'),
    room: { maxCapacity: 20 },
    _count: { courseUserRegistration: 3 },
};

function registerUc() {
    return new AdminRegisterPersonUseCase(courseRepo, userDataRepo, registrationRepo);
}

describe('AdminRegisterPersonUseCase', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(courseRepo.findById).mockResolvedValue(closedCourse as never);
        vi.mocked(userDataRepo.findById).mockResolvedValue({ id: 'person-1' } as never);
        vi.mocked(registrationRepo.findByUserDataAndCourse).mockResolvedValue(null);
        vi.mocked(registrationRepo.createWithCapacity).mockResolvedValue({ id: 'reg-1' } as never);
    });

    it('inscreve já confirmada, ignorando prazo, status e fim do curso', async () => {
        const result = await registerUc().execute({ courseId: 'course-1',
userDataId: 'person-1' });
        expect(result.error).toBeUndefined();
        expect(result.registrationId).toBe('reg-1');
        expect(registrationRepo.createWithCapacity).toHaveBeenCalledWith('course-1', 'person-1', 20, {
            confirmed: true,
        });
    });

    it('exige a pessoa', async () => {
        const result = await registerUc().execute({ courseId: 'course-1',
userDataId: ' ' });
        expect(result.error?.message).toBe('Informe a pessoa a inscrever.');
        expect(courseRepo.findById).not.toHaveBeenCalled();
    });

    it('curso inexistente → CourseNotFoundError', async () => {
        vi.mocked(courseRepo.findById).mockResolvedValue(null);
        const result = await registerUc().execute({ courseId: 'x',
userDataId: 'person-1' });
        expect(result.error).toBeInstanceOf(CourseNotFoundError);
    });

    it('pessoa inexistente → UserDataNotFoundError', async () => {
        vi.mocked(userDataRepo.findById).mockResolvedValue(null);
        const result = await registerUc().execute({ courseId: 'course-1',
userDataId: 'x' });
        expect(result.error).toBeInstanceOf(UserDataNotFoundError);
        expect(registrationRepo.createWithCapacity).not.toHaveBeenCalled();
    });

    it('pessoa já inscrita → 409 com mensagem em português', async () => {
        vi.mocked(registrationRepo.findByUserDataAndCourse).mockResolvedValue({ id: 'reg-0' } as never);
        const result = await registerUc().execute({ courseId: 'course-1',
userDataId: 'person-1' });
        expect(result.error).toBeInstanceOf(PersonAlreadyRegisteredError);
        expect(result.error).toBeInstanceOf(ConflictError);
        expect(result.error?.message).toBe('Pessoa já inscrita neste curso');
        expect(registrationRepo.createWithCapacity).not.toHaveBeenCalled();
    });

    it('corrida no índice único também vira "já inscrita"', async () => {
        vi.mocked(registrationRepo.createWithCapacity).mockRejectedValue({ code: 'P2002' });
        const result = await registerUc().execute({ courseId: 'course-1',
userDataId: 'person-1' });
        expect(result.error).toBeInstanceOf(PersonAlreadyRegisteredError);
    });

    it('curso lotado → CourseFullError', async () => {
        vi.mocked(registrationRepo.createWithCapacity).mockResolvedValue('FULL');
        const result = await registerUc().execute({ courseId: 'course-1',
userDataId: 'person-1' });
        expect(result.error).toBeInstanceOf(CourseFullError);
    });

    it('outros erros do banco sobem', async () => {
        vi.mocked(registrationRepo.createWithCapacity).mockRejectedValue(new Error('db down'));
        await expect(
            registerUc().execute({ courseId: 'course-1',
userDataId: 'person-1' }),
        ).rejects.toThrow('db down');
    });
});

describe('ConfirmAllRegistrationsUseCase', () => {
    beforeEach(() => vi.clearAllMocks());

    it('retorna quantas inscrições foram confirmadas', async () => {
        vi.mocked(courseRepo.findById).mockResolvedValue(closedCourse as never);
        vi.mocked(registrationRepo.confirmAll).mockResolvedValue(4);
        const result = await new ConfirmAllRegistrationsUseCase(courseRepo, registrationRepo).execute('course-1');
        expect(result).toEqual({ confirmed: 4 });
        expect(registrationRepo.confirmAll).toHaveBeenCalledWith('course-1');
    });

    it('curso inexistente → CourseNotFoundError sem mexer nas inscrições', async () => {
        vi.mocked(courseRepo.findById).mockResolvedValue(null);
        const result = await new ConfirmAllRegistrationsUseCase(courseRepo, registrationRepo).execute('x');
        expect(result.error).toBeInstanceOf(CourseNotFoundError);
        expect(registrationRepo.confirmAll).not.toHaveBeenCalled();
    });
});
