import { z } from 'zod';
import { EducationLevel, Ethnicity, Gender } from '../../../generated/prisma/enums.js';
import type { PersonExportRow } from '../../../ports/external/export-repository.js';
import { EDUCATION_LABEL, ETHNICITY_LABEL, GENDER_LABEL } from '../../../lib/export-labels.js';
import { bool, describeByLabels, enumOf, idList, text } from '../filters.js';
import { personFields, reportFields } from './person-fields.js';
import type { ExportSource } from './types.js';

// Fonte `people`: Usuários › Pessoa física e Associados (permissão READ_USER).
// Todos os campos da pessoa saem só com a permissão da fonte.

const filters = z.object({
    ids: idList,
    search: text,
    memberType: text,
    memberClassification: text,
    gender: enumOf(Gender),
    ethnicity: enumOf(Ethnicity),
    educationLevel: enumOf(EducationLevel),
    incompleteRegistration: bool,
    activeMember: bool,
});

type PeopleFilters = z.infer<typeof filters>;

const filterLabels = {
    search: 'Busca',
    memberType: 'Tipo de membro',
    memberClassification: 'Classificação',
    gender: 'Sexo',
    ethnicity: 'Etnia',
    educationLevel: 'Escolaridade',
    incompleteRegistration: 'Cadastro incompleto',
    activeMember: 'Só associados em dia',
};

/** As 57 colunas de hoje, na ordem de hoje. Congeladas pelo teste de ouro. */
const PADRAO = [
    'name', 'nickname', 'cpf', 'rg', 'rgIssuer', 'rgIssuedAt', 'birthDate', 'gender', 'maritalStatus',
    'nationality', 'birthPlace', 'ethnicity', 'educationLevel', 'specialNeeds', 'driverLicense',
    'driverLicenseCategory', 'email', 'phone', 'phone2', 'phone3', 'memberType', 'memberClassification',
    'functionalCategory', 'familyIncome', 'cadPro', 'memberStatus', 'activeMember', 'memberSince',
    'membershipValidUntil', 'memberNotesNumber', 'memberNotes', 'boardMember', 'boardPosition', 'primaryProperty',
    'addressType', 'addressStreet', 'addressNumber', 'addressComplement', 'addressNeighborhood', 'addressLocality',
    'addressRoad', 'addressKm', 'addressLot', 'addressSection', 'addressCity', 'addressState', 'addressZipCode',
    'properties', 'companies', 'relations', 'instructor', 'adminUsername', 'unimedPlan', 'publicContact',
    'registrationsCount', 'createdAt', 'updatedAt',
];

export const peopleSource: ExportSource<PersonExportRow, PeopleFilters> = {
    dataset: 'people',
    filters,
    filterLabels,
    // `activeMember: false` não filtra nada na lista (só o true filtra).
    describeFilters: f =>
        describeByLabels({ ...f,
activeMember: f.activeMember || undefined }, filterLabels, { gender: GENDER_LABEL,
ethnicity: ETHNICITY_LABEL,
educationLevel: EDUCATION_LABEL }),
    fields: [...personFields<PersonExportRow>(p => p), ...reportFields<PersonExportRow>()],
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
fields: ['name', 'phone', 'phone2', 'phone3', 'email', 'addressCity'] },
        { id: 'lista-presenca',
name: 'Lista de presença',
fields: ['ordinal', 'name', 'cpf', 'signature'] },
        {
            id: 'endereco-correspondencia',
            name: 'Endereço para correspondência',
            fields: [
                'name', 'addressStreet', 'addressNumber', 'addressComplement', 'addressNeighborhood', 'addressCity',
                'addressState', 'addressZipCode',
            ],
        },
        {
            id: 'associados',
            name: 'Associados',
            fields: ['name', 'cpf', 'memberStatus', 'memberSince', 'membershipValidUntil', 'phone'],
        },
    ],
    query: (repo, { ids, ...rest }, take) => repo.people({ ids,
...rest,
take }),
    firstName: row => row.name,
};
