import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SetRegistrationAttendanceUseCase, SetUnmarkedAttendanceUseCase } from '../course-attendance.js';
import type { CourseRepository } from '../../ports/external/course-repository.js';
import type { RegistrationRepository } from '../../ports/external/registration-repository.js';
import { CourseNotFoundError, RegistrationNotFoundError } from '../../errors/not-found.js';
import { ValidationError } from '../../errors/validation.js';

const courseRepo = { findById: vi.fn() } as unknown as CourseRepository;
const registrationRepo = {
    findById: vi.fn(),
    setAttended: vi.fn(),
    setAttendedForUnmarked: vi.fn(),
} as unknown as RegistrationRepository;

describe('SetRegistrationAttendanceUseCase', () => {
    const uc = () => new SetRegistrationAttendanceUseCase(registrationRepo);

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(registrationRepo.findById).mockResolvedValue({ id: 'reg-1' } as never);
        vi.mocked(registrationRepo.setAttended).mockImplementation(
            async (id, attended) => ({ id,
attended }) as never,
        );
    });

    it.each([true, false, null])('marca presença = %s', async attended => {
        const result = await uc().execute('reg-1', attended);
        expect(result).toEqual({ registration: { id: 'reg-1',
attended } });
        expect(registrationRepo.setAttended).toHaveBeenCalledWith('reg-1', attended);
    });

    it.each([undefined, 'true', 1])('valor inválido (%s) → 400', async attended => {
        const result = await uc().execute('reg-1', attended);
        expect(result.error).toBeInstanceOf(ValidationError);
        expect(registrationRepo.setAttended).not.toHaveBeenCalled();
    });

    it('inscrição inexistente ou cancelada → RegistrationNotFoundError', async () => {
        vi.mocked(registrationRepo.findById).mockResolvedValue(null);
        const result = await uc().execute('x', true);
        expect(result.error).toBeInstanceOf(RegistrationNotFoundError);
        expect(registrationRepo.setAttended).not.toHaveBeenCalled();
    });
});

describe('SetUnmarkedAttendanceUseCase', () => {
    const uc = () => new SetUnmarkedAttendanceUseCase(courseRepo, registrationRepo);

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(courseRepo.findById).mockResolvedValue({ id: 'course-1' } as never);
    });

    it('marca as sem marcar e devolve quantas mudaram', async () => {
        vi.mocked(registrationRepo.setAttendedForUnmarked).mockResolvedValue(7);
        const result = await uc().execute('course-1', true);
        expect(result).toEqual({ updated: 7 });
        expect(registrationRepo.setAttendedForUnmarked).toHaveBeenCalledWith('course-1', true);
    });

    it.each([null, undefined, 'true'])('valor inválido (%s) → 400 sem mexer', async attended => {
        const result = await uc().execute('course-1', attended);
        expect(result.error).toBeInstanceOf(ValidationError);
        expect(registrationRepo.setAttendedForUnmarked).not.toHaveBeenCalled();
    });

    it('curso inexistente → CourseNotFoundError', async () => {
        vi.mocked(courseRepo.findById).mockResolvedValue(null);
        const result = await uc().execute('x', true);
        expect(result.error).toBeInstanceOf(CourseNotFoundError);
        expect(registrationRepo.setAttendedForUnmarked).not.toHaveBeenCalled();
    });
});
