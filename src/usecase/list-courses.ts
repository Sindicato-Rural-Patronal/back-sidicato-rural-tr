import type { CourseRepository, CourseListFilters } from '../ports/external/course-repository.js';
import { CourseStatus } from '../ports/external/course-repository.js';
import type { CourseFrontendDetail } from './get-course-detail.js';
import { mapToFrontend } from './get-course-detail.js';
import type { PagedResult } from '../lib/pagination.js';
import { todayInBrazil } from '../lib/quote-products.js';

/** `include` (padrão): os terminados vêm depois dos outros. `exclude`: ficam de fora. */
export type EndedCourses = 'include' | 'exclude';

type ListCoursesRequest = {
    page?: number;
    limit?: number;
    ended?: EndedCourses;
    /** Relógio (para os testes). */
    now?: Date;
};

type ListCoursesResponse = {
    error?: Error;
    result?: PagedResult<CourseFrontendDetail>;
};

/**
 * Cursos públicos do site. Primeiro os que ainda não terminaram (em andamento e
 * próximos), do início mais cedo para o mais tarde; depois os terminados, do
 * mais recente para o mais antigo. "Terminou" = o dia do fim já passou em
 * Brasília (no último dia o curso ainda conta como não terminado), a mesma
 * regra da inscrição. Antes vinha tudo por início crescente, e com 9 cursos
 * antigos ainda públicos a home (limit 9) só mostrava cursos passados.
 */
export class ListCoursesUseCase {
    constructor(private readonly courseRepository: CourseRepository) {}

    async execute({ page = 1, limit = 20, ended = 'include', now = new Date() }: ListCoursesRequest = {}): Promise<ListCoursesResponse> {
        // Datas do curso são hora "de parede" com Z: hoje 00:00 no mesmo formato.
        const today = todayInBrazil(now);
        const upcoming: CourseListFilters = { status: CourseStatus.PUBLIC,
endsFrom: today };
        const past: CourseListFilters = { status: CourseStatus.PUBLIC,
endedBefore: today };

        const [upcomingTotal, pastTotal] = await Promise.all([
            this.courseRepository.count(upcoming),
            ended === 'include' ? this.courseRepository.count(past) : Promise.resolve(0),
        ]);

        // A página atravessa os dois grupos: completa com os terminados o que
        // faltar dos que ainda não terminaram.
        const skip = (page - 1) * limit;
        const first = skip < upcomingTotal ? await this.courseRepository.findAll(upcoming, skip, limit, 'asc') : [];
        const missing = limit - first.length;
        const rest =
            missing > 0 && pastTotal > 0
                ? await this.courseRepository.findAll(past, Math.max(0, skip - upcomingTotal), missing, 'desc')
                : [];

        const total = upcomingTotal + pastTotal;
        return {
            result: {
                data: [...first, ...rest].map(mapToFrontend),
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        };
    }
}
