import type { CourseRepository, CourseStatus } from '../ports/external/course-repository.js';
import { CourseNotFoundError } from '../errors/not-found.js';
import { BusinessRuleError } from '../errors/business-rule.js';

export class CourseNotInProgressError extends BusinessRuleError {
    constructor() {
        super('Só é possível concluir um curso que está em andamento.');
        this.name = 'CourseNotInProgressError';
    }
}

/**
 * Marca o curso como concluído (status COMPLETED). É sempre manual: a equipe
 * conclui pelo painel um curso em andamento. Outro status → 409.
 */
export class CompleteCourseUseCase {
    constructor(private readonly courseRepository: CourseRepository) {}

    async execute(courseId: string): Promise<{
        error?: Error;
        course?: {
 id: string;
status: CourseStatus 
};
    }> {
        const course = await this.courseRepository.findById(courseId);
        if (!course) return { error: new CourseNotFoundError() };
        if (course.status !== 'IN_PROGRESS') return { error: new CourseNotInProgressError() };

        const updated = await this.courseRepository.update(courseId, { status: 'COMPLETED' });
        // update devolve null quando o curso some entre a busca e a gravação.
        if (!updated) return { error: new CourseNotFoundError() };
        return { course: { id: updated.id,
status: updated.status } };
    }
}
