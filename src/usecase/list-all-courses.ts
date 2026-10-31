import type {
    CourseRepository,
    CourseWithDetails,
    CourseStatus,
    CourseListFilters,
} from '../ports/external/course-repository.js';
import { paginate, type PagedResult } from '../lib/pagination.js';
import { todayInBrazil } from '../lib/quote-products.js';

export type CourseCardItem = {
    id: string;
    status: CourseStatus;
    title: string;
    eventNumber: string | null;
    startDate: string;
    enrolled: number;
    maxStudents: number;
    price: number;
    coverImage: string | null;
    /** Miniatura WebP da capa; null → usar coverImage. */
    coverImageThumb: string | null;
    photoCount: number;
};

export function mapToCard(course: CourseWithDetails): CourseCardItem {
    return {
        id: course.id,
        status: course.status,
        title: course.name,
        eventNumber: course.eventNumber ?? null,
        startDate: course.startTime.toISOString().split('T')[0],
        enrolled: course._count.courseUserRegistration,
        maxStudents: course.room.maxCapacity,
        price: course.price,
        coverImage: course.bannerUrl ?? null,
        coverImageThumb: course.bannerThumbUrl ?? null,
        photoCount: course.photos.length,
    };
}

type ListAllCoursesResponse = {
    error?: Error;
    result?: PagedResult<CourseCardItem>;
};

export type CourseAdminView = 'upcoming' | 'stored';

/**
 * Visões da lista do painel (SR-057, A9). O curso fica em `upcoming` até o dia
 * do início; no dia do início (relógio de Brasília) passa sozinho para `stored`.
 * É só filtro por data na consulta, sem job, e vale para qualquer status (o
 * concluído continua nas Armazenadas, marcado pelo `status`).
 * `startTime` é hora de parede com Z, então o dia de hoje em Brasília,
 * rotulado em UTC, é o corte: início de hoje ou antes = armazenado.
 */
export function viewFilters(view: CourseAdminView, now: Date = new Date()): Pick<CourseListFilters, 'startsFrom' | 'startsBefore'> {
    const tomorrow = new Date(todayInBrazil(now).getTime() + 24 * 60 * 60 * 1000);
    return view === 'stored' ? { startsBefore: tomorrow } : { startsFrom: tomorrow };
}

export class ListAllCoursesUseCase {
    constructor(private courseRepository: CourseRepository) {}

    async execute(page = 1, limit = 20, filters?: CourseListFilters, view?: CourseAdminView): Promise<ListAllCoursesResponse> {
        const where = view ? { ...filters,
...viewFilters(view) } : filters;
        // Armazenados: o mais recente primeiro. Sem `view`, a ordem de sempre.
        const order = view === 'stored' ? 'desc' : 'asc';
        return {
            result: await paginate(
                page,
                limit,
                (skip, take) =>
                    this.courseRepository.findAll(where, skip, take, order).then(cs => cs.map(mapToCard)),
                () => this.courseRepository.count(where),
            ),
        };
    }
}
