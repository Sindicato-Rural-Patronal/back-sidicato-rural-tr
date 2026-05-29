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
    findByEmailOurPhone: vi.fn(),
    findByEmailOrCpf: vi.fn(),
    findAll: vi.fn(),
} as unknown as UserDataRepository;

const mockRegistrationRepo = {
    create: vi.fn(),
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
    cpf: '12345678901',
};

const publishedCourse = { id: validInput.courseId, status: 'PUBLICO' };
const unpublishedCourse = { id: validInput.courseId, status: 'NAO_PUBLICADO' };

describe('RegisterForCourseUseCase', () => {
    beforeEach(() => vi.clearAllMocks());

    describe('validação de input', () => {
        it('falha se email for inválido', async () => {
            const uc = new RegisterForCourseUseCase(mockCourseRepo, mockUserDataRepo, mockRegistrationRepo);
            const result = await uc.execute({ ...validInput, email: 'nao-e-email' });
            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
        });

        it('falha se courseId estiver vazio', async () => {
            const uc = new RegisterForCourseUseCase(mockCourseRepo, mockUserDataRepo, mockRegistrationRepo);
            const result = await uc.execute({ ...validInput, courseId: '' });
            expect(result.success).toBe(false);
        });
    });

    describe('verificação do curso', () => {
        it('falha se curso não existir', async () => {
            vi.mocked(mockCourseRepo.findById).mockResolvedValue(null);
            const uc = new RegisterForCourseUseCase(mockCourseRepo, mockUserDataRepo, mockRegistrationRepo);
            const result = await uc.execute(validInput);
            expect(result.success).toBe(false);
            expect(result.error?.message).toBe('Course not found');
        });

        it('falha se curso estiver NAO_PUBLICADO', async () => {
            vi.mocked(mockCourseRepo.findById).mockResolvedValue(unpublishedCourse as any);
            const uc = new RegisterForCourseUseCase(mockCourseRepo, mockUserDataRepo, mockRegistrationRepo);
            const result = await uc.execute(validInput);
            expect(result.success).toBe(false);
            expect(result.error?.message).toBe('Registrations unavailable for this course');
        });
    });

    describe('gerenciamento de userData', () => {
        it('reutiliza userData existente se email/cpf já cadastrado', async () => {
            vi.mocked(mockCourseRepo.findById).mockResolvedValue(publishedCourse as any);
            vi.mocked(mockUserDataRepo.findByEmailOrCpf).mockResolvedValue({ id: 'ud-existing' } as any);
            vi.mocked(mockRegistrationRepo.findByUserDataAndCourse).mockResolvedValue(null);
            vi.mocked(mockRegistrationRepo.create).mockResolvedValue({ id: 'reg-001' } as any);
            const uc = new RegisterForCourseUseCase(mockCourseRepo, mockUserDataRepo, mockRegistrationRepo);
            await uc.execute(validInput);
            expect(mockUserDataRepo.create).not.toHaveBeenCalled();
        });

        it('cria novo userData se não existir', async () => {
            vi.mocked(mockCourseRepo.findById).mockResolvedValue(publishedCourse as any);
            vi.mocked(mockUserDataRepo.findByEmailOrCpf).mockResolvedValue(null);
            vi.mocked(mockUserDataRepo.create).mockResolvedValue({ id: 'ud-new' } as any);
            vi.mocked(mockRegistrationRepo.findByUserDataAndCourse).mockResolvedValue(null);
            vi.mocked(mockRegistrationRepo.create).mockResolvedValue({ id: 'reg-002' } as any);
            const uc = new RegisterForCourseUseCase(mockCourseRepo, mockUserDataRepo, mockRegistrationRepo);
            await uc.execute(validInput);
            expect(mockUserDataRepo.create).toHaveBeenCalledOnce();
        });

        it('falha se criação de userData retornar null', async () => {
            vi.mocked(mockCourseRepo.findById).mockResolvedValue(publishedCourse as any);
            vi.mocked(mockUserDataRepo.findByEmailOrCpf).mockResolvedValue(null);
            vi.mocked(mockUserDataRepo.create).mockResolvedValue(null);
            const uc = new RegisterForCourseUseCase(mockCourseRepo, mockUserDataRepo, mockRegistrationRepo);
            const result = await uc.execute(validInput);
            expect(result.success).toBe(false);
            expect(result.error?.message).toBe('Failed to create user record');
        });
    });

    describe('verificação de duplicidade', () => {
        it('falha se usuário já estiver inscrito no curso', async () => {
            vi.mocked(mockCourseRepo.findById).mockResolvedValue(publishedCourse as any);
            vi.mocked(mockUserDataRepo.findByEmailOrCpf).mockResolvedValue({ id: 'ud-existing' } as any);
            vi.mocked(mockRegistrationRepo.findByUserDataAndCourse).mockResolvedValue({ id: 'reg-dup' } as any);
            const uc = new RegisterForCourseUseCase(mockCourseRepo, mockUserDataRepo, mockRegistrationRepo);
            const result = await uc.execute(validInput);
            expect(result.success).toBe(false);
            expect(result.error?.message).toBe('User already registered for this course');
        });
    });

    describe('inscrição bem-sucedida', () => {
        it('retorna registrationId e userDataId ao inscrever com sucesso', async () => {
            vi.mocked(mockCourseRepo.findById).mockResolvedValue(publishedCourse as any);
            vi.mocked(mockUserDataRepo.findByEmailOrCpf).mockResolvedValue({ id: 'ud-001' } as any);
            vi.mocked(mockRegistrationRepo.findByUserDataAndCourse).mockResolvedValue(null);
            vi.mocked(mockRegistrationRepo.create).mockResolvedValue({ id: 'reg-001' } as any);
            const uc = new RegisterForCourseUseCase(mockCourseRepo, mockUserDataRepo, mockRegistrationRepo);
            const result = await uc.execute(validInput);
            expect(result.success).toBe(true);
            expect(result.registrationId).toBe('reg-001');
            expect(result.userDataId).toBe('ud-001');
        });
    });
});
