import { z } from 'zod';
import type { ExportRepository, RegistrationExportRow } from '../../../ports/external/export-repository.js';
import { bool, idList } from '../filters.js';
import { milhar } from '../format.js';
import { personFields, reportFields } from './person-fields.js';
import type { ExportField, ExportFilterDescription, ExportSource } from './types.js';

// Fonte `registrations`: inscrições dos cursos (permissão READ_COURSE).
//
// Permissão cruzada (decisão 006, item 2): quem só tem READ_COURSE já
// exportava nome, CPF, e-mail, telefone, nascimento, idade, associado em dia,
// empresa parceira, cargo na diretoria e contato público. Esses continuam só
// com READ_COURSE. O resto da pessoa (RG, endereço, renda…) pede também
// READ_USER, para ninguém ganhar acesso que não tinha.

const filters = z.object({
    ids: idList,
    courseIds: idList,
    // true = só as confirmadas; ausente ou false = todas.
    confirmed: bool,
});

type RegistrationFilters = z.infer<typeof filters>;

const filterLabels = {
    courseIds: 'Cursos',
    confirmed: 'Só confirmadas',
};

/** Campos da pessoa que já saíam na planilha de inscrições antes do montador. */
export const REGISTRATION_FREE_PERSON_FIELDS = [
    'name', 'cpf', 'email', 'phone', 'birthDate', 'age', 'activeMember', 'partnerCompanies', 'boardPosition',
    'publicContact',
] as const;

const registrationFields: ExportField<RegistrationExportRow>[] = [
    { key: 'course',
label: 'Curso',
group: 'Inscrição',
type: 'text',
privacy: 'comum',
weight: 3,
value: r => r.course.name },
    { key: 'eventNumber',
label: 'Nº do evento',
group: 'Inscrição',
type: 'text',
privacy: 'comum',
value: r => r.course.eventNumber },
    { key: 'courseStart',
label: 'Início do curso',
group: 'Inscrição',
type: 'wallclock',
privacy: 'comum',
value: r => r.course.startTime },
    // 1,25 (e não 1, o de sim/não): "Confirmada" cabe sem cortar a palavra em
    // relatórios de até 8 colunas (SR-093).
    { key: 'confirmed',
label: 'Confirmada',
group: 'Inscrição',
type: 'boolean',
privacy: 'comum',
weight: 1.25,
value: r => r.confirmed },
    {
        key: 'attendance',
        label: 'Presença',
        group: 'Inscrição',
        type: 'text',
        privacy: 'comum',
        value: r => (r.attended === null ? '' : r.attended ? 'Presente' : 'Faltou'),
    },
    { key: 'hasFicha',
label: 'Ficha anexada',
group: 'Inscrição',
type: 'boolean',
privacy: 'comum',
value: r => !!r.ficha },
    { key: 'registeredAt',
label: 'Inscrito em',
group: 'Inscrição',
type: 'datetime',
privacy: 'comum',
value: r => r.createdAt },
];

/** As 17 colunas de hoje, na ordem de hoje. Congeladas pelo teste de ouro. */
const PADRAO = [
    'course', 'eventNumber', 'courseStart', 'name', 'cpf', 'email', 'phone', 'birthDate', 'age', 'confirmed',
    'attendance', 'activeMember', 'partnerCompanies', 'boardPosition', 'publicContact', 'hasFicha', 'registeredAt',
];

/** Até quantos cursos o filtro diz pelo nome; acima, só a quantidade. */
const MAX_NAMED_COURSES = 3;

/**
 * "Curso: HORTA" quando dá para dizer o nome; senão "Cursos: 4". O nome vem
 * das linhas; o curso que não deu nenhuma linha (ex.: "Só confirmadas" sem
 * nenhuma confirmada) não aparece nelas, e então os nomes vêm pelo id.
 */
async function describeCourses(
    courseIds: string[],
    rows: RegistrationExportRow[],
    repo: ExportRepository,
): Promise<ExportFilterDescription> {
    const ids = [...new Set(courseIds)];
    const count = { nome: 'Cursos',
valor: milhar(ids.length) };
    if (ids.length > MAX_NAMED_COURSES) return count;
    let names = [...new Set(rows.map(r => r.course.name))];
    if (names.length !== ids.length) {
        const found = await repo.courseNames(ids);
        names = found.length === ids.length ? [...new Set(found.map(c => c.name))] : [];
    }
    // Dois cursos com o mesmo nome também caem na quantidade.
    if (!names.length || names.length !== ids.length) return count;
    return { nome: names.length === 1 ? 'Curso' : 'Cursos',
valor: names.join(', ') };
}

export const registrationsSource: ExportSource<RegistrationExportRow, RegistrationFilters> = {
    dataset: 'registrations',
    filters,
    filterLabels,
    describeFilters: async (f, rows, repo) => [
        ...(f.courseIds?.length ? [await describeCourses(f.courseIds, rows, repo)] : []),
        ...(f.confirmed ? [{ nome: filterLabels.confirmed,
valor: 'Sim' }] : []),
    ],
    fields: [
        ...registrationFields,
        ...personFields<RegistrationExportRow>(r => r.userData, {
            permission: 'READ_USER',
            free: REGISTRATION_FREE_PERSON_FIELDS,
        }),
        ...reportFields<RegistrationExportRow>(),
    ],
    padrao: PADRAO,
    modelos: [
        { id: 'nome-cpf',
name: 'Nome e CPF',
fields: ['name', 'cpf'] },
        { id: 'nome-email',
name: 'Nome e e-mail',
fields: ['name', 'email'] },
        { id: 'contato',
name: 'Contato',
fields: ['name', 'phone', 'email'] },
        { id: 'lista-presenca',
name: 'Lista de presença',
fields: ['ordinal', 'name', 'cpf', 'signature'],
confirmed: true },
    ],
    query: (repo, { ids, courseIds, confirmed }, take) => repo.registrations({ ids,
courseIds,
confirmed,
take }),
    firstName: row => row.userData.name,
};
