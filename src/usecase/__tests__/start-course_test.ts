import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StartCourseUseCase } from '../start-course.js';
import type { CourseRepository } from '../../ports/external/course-repository.js';
import type { RegistrationRepository } from '../../ports/external/registration-repository.js';
import { CourseNotFoundError } from '../../errors/not-found.js';
import { ValidationError } from '../../errors/validation.js';

const courseRepo = { findById: vi.fn(),
update: vi.fn() } as unknown as CourseRepository;
const registrationRepo = { countByCourseId: vi.fn() } as unknown as RegistrationRepository;

const uc = () => new StartCourseUseCase(courseRepo, registrationRepo);

describe('StartCourseUseCase', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(courseRepo.findById).mockResolvedValue({ id: 'course-1',
status: 'PUBLIC' } as never);
    });

    it('inicia mesmo com inscrições ainda não confirmadas', async () => {
        vi.mocked(registrationRepo.countByCourseId).mockResolvedValue(3);
        const result = await uc().execute('course-1');
        expect(result.error).toBeUndefined();
        expect(courseRepo.update).toHaveBeenCalledWith('course-1', { status: 'IN_PROGRESS' });
    });

    it('curso concluído não volta a "em andamento" pelo iniciar', async () => {
        vi.mocked(courseRepo.findById).mockResolvedValue({ id: 'course-1',
status: 'COMPLETED' } as never);
        const result = await uc().execute('course-1');
        expect(result.error).toBeInstanceOf(ValidationError);
        expect(courseRepo.update).not.toHaveBeenCalled();
    });

    it('sem inscrições → 400 e não muda o status', async () => {
        vi.mocked(registrationRepo.countByCourseId).mockResolvedValue(0);
        const result = await uc().execute('course-1');
        expect(result.error).toBeInstanceOf(ValidationError);
        expect(result.error?.message).toBe('Não há inscrições neste curso.');
        expect(courseRepo.update).not.toHaveBeenCalled();
    });

    it('curso inexistente → CourseNotFoundError', async () => {
        vi.mocked(courseRepo.findById).mockResolvedValue(null);
        const result = await uc().execute('x');
        expect(result.error).toBeInstanceOf(CourseNotFoundError);
        expect(courseRepo.update).not.toHaveBeenCalled();
    });
});
