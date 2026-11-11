import { z } from 'zod';
import type { CourseExportRow } from '../../../ports/external/export-repository.js';
import { COURSE_STATUS_LABEL, label } from '../../../lib/export-labels.js';
import { viewFilters } from '../../list-all-courses.js';
import { empty, idList, text } from '../filters.js';
import { reportFields } from './person-fields.js';
import type { ExportField, ExportFilterDescription, ExportSource } from './types.js';

// Fonte `courses`: Cursos e a janela do curso (permissão READ_COURSE). Nada
// aqui é dado pessoal: os instrutores saem só pelo nome.
//
// Desde a fase 2 (decisão 006), a exportação respeita a aba e o ano da lista,
// com os mesmos nomes e valores de `GET /admin/courses`: `view`
// (`upcoming` = Próximos, `stored` = Armazenados) e `year`. Sem os dois, sai
// como sempre saiu.
//
// AS CHAVES SÃO CONTRATO: não se renomeia nem se reaproveita uma chave.

const YEAR_MESSAGE = 'Ano inválido: use de 1990 a 2100';

const filters = z.object({
    ids: idList,
    search: text,
    status: z.preprocess(empty, z.enum(['PUBLIC', 'PRIVATE', 'UNPUBLISHED', 'IN_PROGRESS', 'COMPLETED']).optional()),
    view: z.preprocess(empty, z.enum(['upcoming', 'stored'], { message: 'Filtro inválido' }).optional()),
    // "2026" na query do GET, 2026 no corpo do POST. Os limites são os da lista.
    year: z.preprocess(
        v => {
            const value = empty(v);
            return typeof value === 'string' ? Number(value.trim()) : value;
        },
        z.number({ message: YEAR_MESSAGE }).int(YEAR_MESSAGE).min(1990, YEAR_MESSAGE).max(2100, YEAR_MESSAGE).optional(),
    ),
});

type CourseFilters = z.infer<typeof filters>;

const filterLabels = {
    view: 'Aba',
    search: 'Busca',
    year: 'Ano',
    status: 'Status',
};

/** Os nomes das abas da lista de cursos. */
const VIEW_LABEL = { upcoming: 'Próximos',
stored: 'Armazenados' } as const;

const courseFields: ExportField<CourseExportRow>[] = [
    // Curso
    { key: 'name',
label: 'Curso',
group: 'Curso',
type: 'text',
privacy: 'comum',
weight: 3,
value: c => c.name },
    { key: 'eventNumber',
label: 'Nº do evento',
group: 'Curso',
type: 'text',
privacy: 'comum',
value: c => c.eventNumber },
    { key: 'status',
label: 'Status',
group: 'Curso',
type: 'text',
privacy: 'comum',
value: c => label(COURSE_STATUS_LABEL, c.status) },
    {
        key: 'instructors',
        label: 'Instrutores',
        group: 'Curso',
        type: 'list',
        privacy: 'comum',
        weight: 3,
        value: c => c.instructors.map(i => (i.title ? `${i.instructor.userData.name} (${i.title})` : i.instructor.userData.name)),
    },
    { key: 'description',
label: 'Descrição',
group: 'Curso',
type: 'text',
privacy: 'comum',
weight: 4,
value: c => c.description },
    { key: 'observations',
label: 'Observações',
group: 'Curso',
type: 'text',
privacy: 'comum',
weight: 4,
value: c => c.observations },

    // Datas (horário de parede: sai como foi gravado)
    { key: 'startTime',
label: 'Início',
group: 'Datas',
type: 'wallclock',
privacy: 'comum',
value: c => c.startTime },
    { key: 'endTime',
label: 'Término',
group: 'Datas',
type: 'wallclock',
privacy: 'comum',
value: c => c.endTime },
    {
        key: 'registrationDeadline',
        label: 'Inscrições até',
        group: 'Datas',
        type: 'wallclock',
        privacy: 'comum',
        value: c => c.registrationDeadline,
    },
    { key: 'workloadHours',
label: 'Carga horária (h)',
group: 'Datas',
type: 'number',
privacy: 'comum',
value: c => c.workloadHours },

    // Sala
    { key: 'room',
label: 'Sala',
group: 'Sala',
type: 'text',
privacy: 'comum',
value: c => c.room.name },
    { key: 'roomCapacity',
label: 'Capacidade da sala',
group: 'Sala',
type: 'number',
privacy: 'comum',
value: c => c.room.maxCapacity },

    // Vagas e inscrições
    { key: 'price',
label: 'Valor (R$)',
group: 'Vagas e inscrições',
type: 'money',
privacy: 'comum',
value: c => c.price },
    { key: 'minStudents',
label: 'Mínimo de alunos',
group: 'Vagas e inscrições',
type: 'number',
privacy: 'comum',
value: c => c.minStudents },
    {
        key: 'enrolled',
        label: 'Inscritos',
        group: 'Vagas e inscrições',
        type: 'number',
        privacy: 'comum',
        value: c => c.courseUserRegistration.length,
    },
    {
        key: 'confirmedCount',
        label: 'Confirmados',
        group: 'Vagas e inscrições',
        type: 'number',
        privacy: 'comum',
        value: c => c.courseUserRegistration.filter(r => r.confirmed).length,
    },
    { key: 'preEnrolled',
label: 'Pré-inscritos',
group: 'Vagas e inscrições',
type: 'number',
privacy: 'comum',
value: c => c.preEnrolled },
    { key: 'waitlist',
label: 'Lista de espera',
group: 'Vagas e inscrições',
type: 'number',
privacy: 'comum',
value: c => c.waitlist },

    // Sistema
    { key: 'createdAt',
label: 'Criado em',
group: 'Sistema',
type: 'datetime',
privacy: 'comum',
value: c => c.createdAt },
];

/** As 19 colunas de hoje, na ordem de hoje. Congeladas pelo teste de ouro. */
const PADRAO = [
    'name', 'eventNumber', 'status', 'startTime', 'endTime', 'registrationDeadline', 'room', 'roomCapacity',
    'instructors', 'workloadHours', 'price', 'minStudents', 'enrolled', 'confirmedCount', 'preEnrolled', 'waitlist',
    'description', 'observations', 'createdAt',
];

/** "Aba: Armazenados · Busca: horta · Ano: 2026 · Status: Concluído". */
function describeFilters(f: CourseFilters): ExportFilterDescription[] {
    const out: ExportFilterDescription[] = [];
    if (f.view) out.push({ nome: filterLabels.view,
valor: VIEW_LABEL[f.view] });
    if (f.search) out.push({ nome: filterLabels.search,
valor: f.search });
    if (f.year !== undefined) out.push({ nome: filterLabels.year,
valor: String(f.year) });
    if (f.status) out.push({ nome: filterLabels.status,
valor: label(COURSE_STATUS_LABEL, f.status) });
    return out;
}

export const coursesSource: ExportSource<CourseExportRow, CourseFilters> = {
    dataset: 'courses',
    filters,
    filterLabels,
    describeFilters,
    fields: [...courseFields, ...reportFields<CourseExportRow>()],
    padrao: PADRAO,
    modelos: [
        { id: 'calendario',
name: 'Calendário',
fields: ['name', 'startTime', 'endTime', 'room', 'instructors'] },
    ],
    // A aba é o mesmo corte por data da lista (`viewFilters`), e a ordem também:
    // Armazenados do mais recente para o mais antigo; o resto, do início mais cedo.
    query: (repo, { ids, view, ...rest }, take, { now }) =>
        repo.courses({
            ids,
            ...rest,
            ...(view && viewFilters(view, now)),
            order: view === 'stored' ? 'desc' : 'asc',
            take,
        }),
    firstName: row => row.name,
};
