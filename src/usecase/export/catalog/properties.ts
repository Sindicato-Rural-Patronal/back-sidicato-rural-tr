import { z } from 'zod';
import type { PropertyExportRow } from '../../../ports/external/export-repository.js';
import { idList } from '../filters.js';
import { formatCnpj, formatCpf } from '../format.js';
import { addressFields } from './address-fields.js';
import { reportFields } from './person-fields.js';
import type { ExportField, ExportFilterDescription, ExportSource } from './types.js';

// Fonte `properties`: as propriedades de pessoas e empresas ("Propriedades
// dos selecionados" e as fichas; permissão READ_USER). Pessoais são o CPF ou
// CNPJ do dono e o endereço (decisão 006, inventário).
//
// AS CHAVES SÃO CONTRATO: não se renomeia nem se reaproveita uma chave.

const filters = z.object({
    ids: idList,
    ownerIds: idList,
});

type PropertyFilters = z.infer<typeof filters>;

const filterLabels = {
    ownerIds: 'Donos',
};

/** O dono é uma pessoa ou uma empresa (CHECK `Property_single_owner`). */
const ownerName = (p: PropertyExportRow) => p.userData?.name ?? (p.company ? p.company.tradeName || p.company.name : '');

const propertyFields: ExportField<PropertyExportRow>[] = [
    // Propriedade
    { key: 'name',
label: 'Propriedade',
group: 'Propriedade',
type: 'text',
privacy: 'comum',
weight: 3,
value: p => p.name },
    { key: 'registration',
label: 'Matrícula',
group: 'Propriedade',
type: 'text',
privacy: 'comum',
value: p => p.registration },
    {
        key: 'isPrimary',
        label: 'Principal',
        group: 'Propriedade',
        type: 'boolean',
        privacy: 'comum',
        value: p => (p.userData ?? p.company)?.primaryPropertyId === p.id,
    },

    // Dono
    { key: 'ownerKind',
label: 'Dono',
group: 'Dono',
type: 'text',
privacy: 'comum',
value: p => (p.userData ? 'Pessoa' : 'Empresa') },
    { key: 'ownerName',
label: 'Nome do dono',
group: 'Dono',
type: 'text',
privacy: 'comum',
weight: 3,
value: ownerName },
    // Uma coluna só para os dois documentos, como sempre saiu: por isso o campo
    // já devolve o valor com a máscara do documento do dono (CPF ou CNPJ).
    {
        key: 'ownerDocument',
        label: 'CPF/CNPJ',
        group: 'Dono',
        type: 'text',
        privacy: 'pessoal',
        weight: 2.5,
        value: p => (p.userData ? formatCpf(p.userData.cpf) : formatCnpj(p.company?.cnpj ?? null)),
    },

    // Endereço
    ...addressFields<PropertyExportRow>(p => p.address, {
        prefix: '',
        group: 'Endereço',
        privacy: 'pessoal',
        line: 'Endereço numa linha',
    }),
    {
        key: 'addressNotes',
        label: 'Observações do endereço',
        group: 'Endereço',
        type: 'text',
        privacy: 'pessoal',
        weight: 3,
        value: p => p.address?.notes,
    },

    // Sistema
    { key: 'createdAt',
label: 'Cadastrada em',
group: 'Sistema',
type: 'datetime',
privacy: 'comum',
value: p => p.createdAt },
];

/** As 21 colunas de hoje, na ordem de hoje. Congeladas pelo teste de ouro. */
const PADRAO = [
    'name', 'registration', 'ownerKind', 'ownerName', 'ownerDocument', 'isPrimary', 'addressType', 'addressStreet',
    'addressNumber', 'addressComplement', 'addressNeighborhood', 'addressLocality', 'addressRoad', 'addressKm',
    'addressLot', 'addressSection', 'addressCity', 'addressState', 'addressZipCode', 'addressNotes', 'createdAt',
];

/** Até quantos donos o filtro diz pelo nome; acima, só a quantidade. */
const MAX_NAMED_OWNERS = 3;

/**
 * "Dono: JOÃO" ou "Donos: JOÃO, AGRO" pelos nomes das linhas; dono que não
 * deu nenhuma linha (ou mais de 3) → a quantidade, "Donos: 4".
 */
function describeOwners(ownerIds: string[], rows: PropertyExportRow[]): ExportFilterDescription {
    const unique = [...new Set(ownerIds)];
    const count = { nome: filterLabels.ownerIds,
valor: String(unique.length) };
    if (unique.length > MAX_NAMED_OWNERS) return count;
    const names = unique.map(id => {
        const row = rows.find(p => p.userDataId === id || p.companyId === id);
        return row ? ownerName(row) : '';
    });
    if (names.some(n => !n)) return count;
    return { nome: names.length === 1 ? 'Dono' : filterLabels.ownerIds,
valor: names.join(', ') };
}

export const propertiesSource: ExportSource<PropertyExportRow, PropertyFilters> = {
    dataset: 'properties',
    filters,
    filterLabels,
    describeFilters: (f, rows) => (f.ownerIds?.length ? [describeOwners(f.ownerIds, rows)] : []),
    fields: [...propertyFields, ...reportFields<PropertyExportRow>()],
    padrao: PADRAO,
    // Propriedades só têm o Padrão (decisão 006, item 5).
    modelos: [],
    query: (repo, { ids, ownerIds }, take) => repo.properties({ ids,
ownerIds,
take }),
    firstName: row => row.name,
};
