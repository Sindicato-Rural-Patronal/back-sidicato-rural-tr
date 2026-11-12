import { z } from 'zod';
import type { CompanyExportRow } from '../../../ports/external/export-repository.js';
import { COMPANY_TYPE_LABEL, label } from '../../../lib/export-labels.js';
import { bool, empty, idList, text } from '../filters.js';
import { propertyLine } from '../format.js';
import { addressFields } from './address-fields.js';
import { reportFields } from './person-fields.js';
import type { ExportField, ExportFilterDescription, ExportSource } from './types.js';

// Fonte `companies`: Usuários › Empresas e a ficha da empresa (permissão
// READ_USER). A empresa em si não é dado pessoal (decisão 006, inventário);
// pessoais são o contato e as pessoas vinculadas.
//
// AS CHAVES SÃO CONTRATO: não se renomeia nem se reaproveita uma chave.

const filters = z.object({
    ids: idList,
    search: text,
    type: z.preprocess(empty, z.enum(['PRIVATE', 'PUBLIC']).optional()),
    isPartner: bool,
});

type CompanyFilters = z.infer<typeof filters>;

const filterLabels = {
    search: 'Busca',
    type: 'Tipo',
    isPartner: 'Só parceiras',
};

const companyFields: ExportField<CompanyExportRow>[] = [
    // Empresa
    { key: 'name',
label: 'Razão social',
group: 'Empresa',
type: 'text',
privacy: 'comum',
weight: 3,
value: c => c.name },
    { key: 'tradeName',
label: 'Nome fantasia',
group: 'Empresa',
type: 'text',
privacy: 'comum',
weight: 3,
value: c => c.tradeName },
    { key: 'cnpj',
label: 'CNPJ',
group: 'Empresa',
type: 'cnpj',
privacy: 'comum',
value: c => c.cnpj },
    {
        key: 'stateRegistration',
        label: 'Inscrição estadual',
        group: 'Empresa',
        type: 'text',
        privacy: 'comum',
        value: c => c.stateRegistration,
    },
    { key: 'type',
label: 'Tipo',
group: 'Empresa',
type: 'text',
privacy: 'comum',
value: c => label(COMPANY_TYPE_LABEL, c.type) },

    // Contato
    { key: 'email',
label: 'E-mail',
group: 'Contato',
type: 'text',
privacy: 'pessoal',
weight: 3,
value: c => c.email },
    { key: 'phone',
label: 'Telefone',
group: 'Contato',
type: 'phone',
privacy: 'pessoal',
value: c => c.phone },
    { key: 'phone2',
label: 'Telefone 2',
group: 'Contato',
type: 'phone',
privacy: 'pessoal',
value: c => c.phone2 },
    { key: 'phone3',
label: 'Telefone 3',
group: 'Contato',
type: 'phone',
privacy: 'pessoal',
value: c => c.phone3 },
    { key: 'website',
label: 'Site',
group: 'Contato',
type: 'text',
privacy: 'comum',
weight: 3,
value: c => c.website },

    // Sede
    ...addressFields<CompanyExportRow>(c => c.address, {
        prefix: 'Sede: ',
        group: 'Sede',
        privacy: 'comum',
        line: 'Sede numa linha',
    }),

    // Vínculos
    {
        key: 'members',
        label: 'Pessoas vinculadas',
        group: 'Vínculos',
        type: 'list',
        privacy: 'pessoal',
        weight: 4,
        value: c => c.members.map(m => `${m.userData.name} (${m.title})`),
    },
    {
        key: 'properties',
        label: 'Propriedades',
        group: 'Vínculos',
        type: 'list',
        privacy: 'comum',
        weight: 5,
        value: c => c.properties.map(propertyLine),
    },

    // Parceria
    { key: 'isPartner',
label: 'Parceira',
group: 'Parceria',
type: 'boolean',
privacy: 'comum',
value: c => c.isPartner },
    { key: 'partnerUrl',
label: 'Link da parceria',
group: 'Parceria',
type: 'text',
privacy: 'comum',
weight: 3,
value: c => c.partnerUrl },

    // Sistema
    { key: 'notes',
label: 'Observações',
group: 'Sistema',
type: 'text',
privacy: 'comum',
weight: 4,
value: c => c.notes },
    { key: 'createdAt',
label: 'Cadastrada em',
group: 'Sistema',
type: 'datetime',
privacy: 'comum',
value: c => c.createdAt },
    { key: 'updatedAt',
label: 'Atualizada em',
group: 'Sistema',
type: 'datetime',
privacy: 'comum',
value: c => c.updatedAt },
];

/** As 30 colunas de hoje, na ordem de hoje. Congeladas pelo teste de ouro. */
const PADRAO = [
    'name', 'tradeName', 'cnpj', 'stateRegistration', 'type', 'email', 'phone', 'phone2', 'phone3', 'website',
    'addressType', 'addressStreet', 'addressNumber', 'addressComplement', 'addressNeighborhood', 'addressLocality',
    'addressRoad', 'addressKm', 'addressLot', 'addressSection', 'addressCity', 'addressState', 'addressZipCode',
    'members', 'properties', 'isPartner', 'partnerUrl', 'notes', 'createdAt', 'updatedAt',
];

/** "Tipo: Pública", "Só parceiras" (ou "Só não parceiras"), "Busca: agro". */
function describeFilters(f: CompanyFilters): ExportFilterDescription[] {
    const out: ExportFilterDescription[] = [];
    if (f.search) out.push({ nome: filterLabels.search,
valor: f.search });
    if (f.type) out.push({ nome: filterLabels.type,
valor: label(COMPANY_TYPE_LABEL, f.type) });
    if (f.isPartner !== undefined) out.push({ nome: f.isPartner ? filterLabels.isPartner : 'Só não parceiras',
valor: 'Sim' });
    return out;
}

export const companiesSource: ExportSource<CompanyExportRow, CompanyFilters> = {
    dataset: 'companies',
    filters,
    filterLabels,
    describeFilters,
    fields: [...companyFields, ...reportFields<CompanyExportRow>()],
    padrao: PADRAO,
    modelos: [
        { id: 'razao-social-cnpj',
name: 'Razão social e CNPJ',
fields: ['name', 'cnpj'] },
        { id: 'contato',
name: 'Contato',
fields: ['name', 'tradeName', 'phone', 'phone2', 'phone3', 'email', 'addressCity'] },
    ],
    query: (repo, { ids, ...rest }, take) => repo.companies({ ids,
...rest,
take }),
    // O arquivo de uma empresa leva o nome fantasia, como sempre levou.
    firstName: row => row.tradeName || row.name,
};
