import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListCoursesUseCase } from '../list-courses.js';
import type { CourseListFilters, CourseRepository } from '../../ports/external/course-repository.js';
import { CourseStatus } from '../../ports/external/course-repository.js';

const mockCourseRepo = {
    findAll: vi.fn(),
    count: vi.fn(),
} as unknown as CourseRepository;

function course(id: string, start: string, end = start) {
    return {
        id,
        name: `Curso ${id}`,
        description: 'Desc',
        status: CourseStatus.PUBLIC,
        price: 0,
        workloadHours: 0,
        bannerUrl: null,
        minStudents: 0,
        preEnrolled: 0,
        waitlist: 0,
        startTime: new Date(`${start}T08:00:00.000Z`),
        endTime: new Date(`${end}T12:00:00.000Z`),
        registrationDeadline: null,
        observations: null,
        eventNumber: null,
        room: { name: 'Sala A',
maxCapacity: 20 },
        photos: [],
        _count: { courseUserRegistration: 0 },
        instructors: [],
    };
}

// 16/10/2026 às 10:00 em Brasília (13:00 UTC).
const NOW = new Date('2026-10-16T13:00:00.000Z');
const TODAY = new Date('2026-10-16T00:00:00.000Z');

/** Repositório em memória: aplica os filtros de fim e a ordem como o adapter. */
function fakeRepo(all: ReturnType<typeof course>[]) {
    const match = (f?: CourseListFilters) =>
        all.filter(c =>
            (!f?.endsFrom || c.endTime >= f.endsFrom) && (!f?.endedBefore || c.endTime < f.endedBefore));
    vi.mocked(mockCourseRepo.count).mockImplementation(async f => match(f).length);
    vi.mocked(mockCourseRepo.findAll).mockImplementation(async (f, skip = 0, take = 20, order = 'asc') => {
        const sorted = [...match(f)].sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
        if (order === 'desc') sorted.reverse();
        return sorted.slice(skip, skip + take) as never;
    });
}

const ids = (r: Awaited<ReturnType<ListCoursesUseCase['execute']>>) => r.result?.data.map(c => c.id);

describe('ListCoursesUseCase (GET /courses)', () => {
    beforeEach(() => vi.clearAllMocks());

    const cursos = [
        course('antigo-2024', '2024-03-10'),
        course('antigo-2025', '2025-05-10'),
        course('ontem', '2026-10-15'),
        course('em-andamento', '2026-10-10', '2026-10-20'),
        course('hoje', '2026-10-16'),
        course('proximo', '2026-11-01'),
        course('depois', '2026-12-01'),
    ];

    it('só cursos públicos, nos dois grupos', async () => {
        fakeRepo(cursos);
        await new ListCoursesUseCase(mockCourseRepo).execute({ now: NOW });
        expect(mockCourseRepo.count).toHaveBeenCalledWith({ status: CourseStatus.PUBLIC,
endsFrom: TODAY });
        expect(mockCourseRepo.count).toHaveBeenCalledWith({ status: CourseStatus.PUBLIC,
endedBefore: TODAY });
    });

    it('os que não terminaram vêm primeiro, por início; depois os terminados, do mais recente', async () => {
        fakeRepo(cursos);
        const r = await new ListCoursesUseCase(mockCourseRepo).execute({ now: NOW });
        expect(ids(r)).toEqual(['em-andamento', 'hoje', 'proximo', 'depois', 'ontem', 'antigo-2025', 'antigo-2024']);
        expect(r.result?.total).toBe(7);
    });

    it('no último dia o curso ainda não terminou', async () => {
        fakeRepo([course('hoje', '2026-10-16')]);
        const r = await new ListCoursesUseCase(mockCourseRepo).execute({ now: NOW,
ended: 'exclude' });
        expect(ids(r)).toEqual(['hoje']);
    });

    it('a home (limit 9) não é mais tomada pelos cursos antigos', async () => {
        fakeRepo([
            ...Array.from({ length: 12 }, (_, i) => course(`velho-${i}`, `2025-0${(i % 9) + 1}-01`)),
            course('proximo', '2026-11-01'),
        ]);
        const r = await new ListCoursesUseCase(mockCourseRepo).execute({ now: NOW,
limit: 9 });
        expect(ids(r)?.[0]).toBe('proximo');
    });

    it('ended=exclude deixa os terminados de fora (e do total)', async () => {
        fakeRepo(cursos);
        const r = await new ListCoursesUseCase(mockCourseRepo).execute({ now: NOW,
ended: 'exclude' });
        expect(ids(r)).toEqual(['em-andamento', 'hoje', 'proximo', 'depois']);
        expect(r.result?.total).toBe(4);
        expect(mockCourseRepo.count).toHaveBeenCalledTimes(1);
    });

    it('a paginação atravessa os dois grupos sem repetir nem pular', async () => {
        fakeRepo(cursos);
        const uc = new ListCoursesUseCase(mockCourseRepo);
        const pages = await Promise.all([1, 2, 3].map(page => uc.execute({ now: NOW,
page,
limit: 3 })));
        expect(pages.map(ids)).toEqual([
            ['em-andamento', 'hoje', 'proximo'],
            ['depois', 'ontem', 'antigo-2025'],
            ['antigo-2024'],
        ]);
        expect(pages[0].result?.totalPages).toBe(3);
    });

    it('página só de terminados pula os que não terminaram', async () => {
        fakeRepo(cursos);
        await new ListCoursesUseCase(mockCourseRepo).execute({ now: NOW,
page: 3,
limit: 2 });
        // 4 não terminados: a página 3 (itens 5 e 6) começa nos terminados.
        expect(mockCourseRepo.findAll).toHaveBeenCalledTimes(1);
        expect(mockCourseRepo.findAll).toHaveBeenCalledWith({ status: CourseStatus.PUBLIC,
endedBefore: TODAY }, 0, 2, 'desc');
    });

    it('lista vazia → 200 com página zerada', async () => {
        fakeRepo([]);
        const r = await new ListCoursesUseCase(mockCourseRepo).execute({ now: NOW });
        expect(r.result).toEqual({ data: [],
total: 0,
page: 1,
limit: 20,
totalPages: 0 });
    });

    it('mapeia para o formato do site', async () => {
        fakeRepo([course('proximo', '2026-11-01')]);
        const r = await new ListCoursesUseCase(mockCourseRepo).execute({ now: NOW });
        expect(r.result?.data[0].title).toBe('Curso proximo');
    });
});
