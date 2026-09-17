import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RegisterForCourseUseCase } from '../register-for-course.js';
import type { CourseRepository } from '../../ports/external/course-repository.js';
import type { UserDataRepository } from '../../ports/external/user-data-repository.js';
import type { RegistrationRepository } from '../../ports/external/registration-repository.js';

const mockCourseRepo = {
    findById: vi.fn(),
    create: vi.fn(),
    findAll: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    isRoomAvailable: vi.fn(),
    addPhoto: vi.fn(),
    deletePhoto: vi.fn(),
} as unknown as CourseRepository;

const mockUserDataRepo = {
    create: vi.fn(),
    findById: vi.fn(),
    findByCpf: vi.fn(),
    findAll: vi.fn(),
} as unknown as UserDataRepository;

const mockRegistrationRepo = {
    create: vi.fn(),
    createWithCapacity: vi.fn(),
    findById: vi.fn(),
    findByCourseId: vi.fn(),
    findByUserDataAndCourse: vi.fn(),
    delete: vi.fn(),
} as unknown as RegistrationRepository;

const validInput = {
    courseId: '123e4567-e89b-12d3-a456-426614174000',
    name: 'João Silva',
    phone: '11999999999',
    email: 'joao@email.com',
    cpf: '52998224725',
};

const courseBase = {
    endTime: new Date('2099-01-01T17:00:00.000Z'),
    registrationDeadline: null,
    room: { maxCapacity: 100 },
    _count: { courseUserRegistration: 0 },
};
const publishedCourse = { id: validInput.courseId,
status: 'PUBLIC',
...courseBase };
const unpublishedCourse = { id: validInput.courseId,
status: 'UNPUBLISHED',
...courseBase };

describe('RegisterForCourseUseCase', () => {
    beforeEach(() => vi.clearAllMocks());

    describe('validação de input', () => {
        it('falha se email for inválido', async () => {
            const uc = new RegisterForCourseUseCase(
                mockCourseRepo,
                mockUserDataRepo,
                mockRegistrationRepo,
            );
            const result = await uc.execute({ ...validInput,
email: 'nao-e-email' });
            expect(result.error).toBeDefined();
            expect(result.error).toBeDefined();
        });

        it('falha se courseId estiver vazio', async () => {
            const uc = new RegisterForCourseUseCase(
                mockCourseRepo,
                mockUserDataRepo,
                mockRegistrationRepo,
            );
            const result = await uc.execute({ ...validInput,
courseId: '' });
            expect(result.error).toBeDefined();
        });
    });

    describe('verificação do curso', () => {
        it('falha se curso não existir', async () => {
            vi.mocked(mockCourseRepo.findById).mockResolvedValue(null);
            const uc = new RegisterForCourseUseCase(
                mockCourseRepo,
                mockUserDataRepo,
                mockRegistrationRepo,
            );
            const result = await uc.execute(validInput);
            expect(result.error).toBeDefined();
            expect(result.error?.message).toBe('Course not found');
        });

        it('fails if course is UNPUBLISHED', async () => {
            vi.mocked(mockCourseRepo.findById).mockResolvedValue(unpublishedCourse as any);
            const uc = new RegisterForCourseUseCase(
                mockCourseRepo,
                mockUserDataRepo,
                mockRegistrationRepo,
            );
            const result = await uc.execute(validInput);
            expect(result.error).toBeDefined();
            expect(result.error?.message).toBe('Registrations unavailable for this course');
        });

        it('recusa curso que já terminou, sem cadastrar ninguém', async () => {
            vi.mocked(mockCourseRepo.findById).mockResolvedValue({
                ...publishedCourse,
                endTime: new Date('2020-01-10T17:00:00.000Z'),
            } as any);
            const uc = new RegisterForCourseUseCase(
                mockCourseRepo,
                mockUserDataRepo,
                mockRegistrationRepo,
            );
            const result = await uc.execute(validInput);
            expect(result.error?.message).toBe('Este curso já terminou e não aceita mais inscrições.');
            expect(mockUserDataRepo.create).not.toHaveBeenCalled();
            expect(mockRegistrationRepo.createWithCapacity).not.toHaveBeenCalled();
        });
    });

    describe('gerenciamento de userData', () => {
        it('reutiliza userData existente se o CPF já tem cadastro', async () => {
            vi.mocked(mockCourseRepo.findById).mockResolvedValue(publishedCourse as any);
            vi.mocked(mockUserDataRepo.findByCpf).mockResolvedValue({
                id: 'ud-existing',
            } as any);
            vi.mocked(mockRegistrationRepo.findByUserDataAndCourse).mockResolvedValue(null);
            vi.mocked(mockRegistrationRepo.createWithCapacity).mockResolvedValue({ id: 'reg-001' } as any);
            const uc = new RegisterForCourseUseCase(
                mockCourseRepo,
                mockUserDataRepo,
                mockRegistrationRepo,
            );
            await uc.execute(validInput);
            expect(mockUserDataRepo.create).not.toHaveBeenCalled();
            // Só o CPF identifica a pessoa (e-mail/telefone podem ser da família).
            expect(mockUserDataRepo.findByCpf).toHaveBeenCalledWith(validInput.cpf);
        });

        it('inscreve sem e-mail: cria a pessoa com e-mail null', async () => {
            vi.mocked(mockCourseRepo.findById).mockResolvedValue(publishedCourse as any);
            vi.mocked(mockUserDataRepo.findByCpf).mockResolvedValue(null);
            vi.mocked(mockUserDataRepo.create).mockResolvedValue({ id: 'ud-new' } as any);
            vi.mocked(mockRegistrationRepo.findByUserDataAndCourse).mockResolvedValue(null);
            vi.mocked(mockRegistrationRepo.createWithCapacity).mockResolvedValue({ id: 'reg-003' } as any);
            const uc = new RegisterForCourseUseCase(
                mockCourseRepo,
                mockUserDataRepo,
                mockRegistrationRepo,
            );
            const semEmail = await uc.execute({ ...validInput,
email: '' });
            expect(semEmail.error).toBeUndefined();
            expect(mockUserDataRepo.create).toHaveBeenCalledWith(expect.objectContaining({ email: null }));
            const { email: _email, ...semCampo } = validInput;
            const result = await uc.execute(semCampo);
            expect(result.error).toBeUndefined();
        });

        it('cria novo userData se não existir', async () => {
            vi.mocked(mockCourseRepo.findById).mockResolvedValue(publishedCourse as any);
            vi.mocked(mockUserDataRepo.findByCpf).mockResolvedValue(null);
            vi.mocked(mockUserDataRepo.create).mockResolvedValue({ id: 'ud-new' } as any);
            vi.mocked(mockRegistrationRepo.findByUserDataAndCourse).mockResolvedValue(null);
            vi.mocked(mockRegistrationRepo.createWithCapacity).mockResolvedValue({ id: 'reg-002' } as any);
            const uc = new RegisterForCourseUseCase(
                mockCourseRepo,
                mockUserDataRepo,
                mockRegistrationRepo,
            );
            await uc.execute(validInput);
            expect(mockUserDataRepo.create).toHaveBeenCalledOnce();
        });

        it('falha se criação de userData retornar null', async () => {
            vi.mocked(mockCourseRepo.findById).mockResolvedValue(publishedCourse as any);
            vi.mocked(mockUserDataRepo.findByCpf).mockResolvedValue(null);
            vi.mocked(mockUserDataRepo.create).mockResolvedValue(null);
            const uc = new RegisterForCourseUseCase(
                mockCourseRepo,
                mockUserDataRepo,
                mockRegistrationRepo,
            );
            const result = await uc.execute(validInput);
            expect(result.error).toBeDefined();
            expect(result.error?.message).toBe('Failed to create user record');
        });
    });

    describe('verificação de duplicidade', () => {
        it('falha se usuário já estiver inscrito no curso', async () => {
            vi.mocked(mockCourseRepo.findById).mockResolvedValue(publishedCourse as any);
            vi.mocked(mockUserDataRepo.findByCpf).mockResolvedValue({
                id: 'ud-existing',
            } as any);
            vi.mocked(mockRegistrationRepo.findByUserDataAndCourse).mockResolvedValue({
                id: 'reg-dup',
            } as any);
            const uc = new RegisterForCourseUseCase(
                mockCourseRepo,
                mockUserDataRepo,
                mockRegistrationRepo,
            );
            const result = await uc.execute(validInput);
            expect(result.error).toBeDefined();
            expect(result.error?.message).toBe('User already registered for this course');
        });
    });

    describe('inscrição bem-sucedida', () => {
        it('retorna registrationId e userDataId ao inscrever com sucesso', async () => {
            vi.mocked(mockCourseRepo.findById).mockResolvedValue(publishedCourse as any);
            vi.mocked(mockUserDataRepo.findByCpf).mockResolvedValue({ id: 'ud-001' } as any);
            vi.mocked(mockRegistrationRepo.findByUserDataAndCourse).mockResolvedValue(null);
            vi.mocked(mockRegistrationRepo.createWithCapacity).mockResolvedValue({ id: 'reg-001' } as any);
            const uc = new RegisterForCourseUseCase(
                mockCourseRepo,
                mockUserDataRepo,
                mockRegistrationRepo,
            );
            const result = await uc.execute(validInput);
            expect(result.error).toBeUndefined();
            expect(result.registrationId).toBe('reg-001');
            expect(result.userDataId).toBe('ud-001');
        });
    });
});
