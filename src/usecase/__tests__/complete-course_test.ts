import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CompleteCourseUseCase, CourseNotInProgressError } from '../complete-course.js';
import type { CourseRepository } from '../../ports/external/course-repository.js';
import { CourseNotFoundError } from '../../errors/not-found.js';
import { BusinessRuleError } from '../../errors/business-rule.js';

const courseRepo = { findById: vi.fn(),
update: vi.fn() } as unknown as CourseRepository;

const uc = () => new CompleteCourseUseCase(courseRepo);

describe('CompleteCourseUseCase', () => {
    beforeEach(() => vi.clearAllMocks());

    it('curso em andamento → concluído', async () => {
        vi.mocked(courseRepo.findById).mockResolvedValue({ id: 'course-1',
status: 'IN_PROGRESS' } as never);
        vi.mocked(courseRepo.update).mockResolvedValue({ id: 'course-1',
status: 'COMPLETED' } as never);
        const result = await uc().execute('course-1');
        expect(result).toEqual({ course: { id: 'course-1',
status: 'COMPLETED' } });
        expect(courseRepo.update).toHaveBeenCalledWith('course-1', { status: 'COMPLETED' });
    });

    it.each(['PUBLIC', 'PRIVATE', 'UNPUBLISHED', 'COMPLETED'])('status %s → 409 sem alterar', async status => {
        vi.mocked(courseRepo.findById).mockResolvedValue({ id: 'course-1',
status } as never);
        const result = await uc().execute('course-1');
        expect(result.error).toBeInstanceOf(CourseNotInProgressError);
        expect(result.error).toBeInstanceOf(BusinessRuleError);
        expect(result.error?.message).toBe('Só é possível concluir um curso que está em andamento.');
        expect(courseRepo.update).not.toHaveBeenCalled();
    });

    it('curso inexistente → CourseNotFoundError', async () => {
        vi.mocked(courseRepo.findById).mockResolvedValue(null);
        const result = await uc().execute('x');
        expect(result.error).toBeInstanceOf(CourseNotFoundError);
    });

    it('curso some antes de gravar → CourseNotFoundError', async () => {
        vi.mocked(courseRepo.findById).mockResolvedValue({ id: 'course-1',
status: 'IN_PROGRESS' } as never);
        vi.mocked(courseRepo.update).mockResolvedValue(null);
        const result = await uc().execute('course-1');
        expect(result.error).toBeInstanceOf(CourseNotFoundError);
    });
});
