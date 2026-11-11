import type { ExportAddress } from '../../../ports/external/export-repository.js';
import { ADDRESS_TYPE_LABEL, label } from '../../../lib/export-labels.js';
import { addressLine } from '../format.js';
import type { ExportField, ExportFieldType, ExportPrivacy } from './types.js';

// As 13 colunas de um endereço (mais o "numa linha"), para as fontes que têm
// um endereço só por linha: a sede da empresa e o endereço da propriedade. As
// chaves são as mesmas do endereço da pessoa (`person-fields.ts`), para o
// mesmo campo ter o mesmo nome em todas as fontes.
//
// AS CHAVES SÃO CONTRATO: não se renomeia nem se reaproveita uma chave.

/** Larguras no PDF dos campos de valor curto, as mesmas do endereço da pessoa (SR-093). */
const SHORT_WEIGHT = {
    addressPart: 1.25,
    addressState: 1,
} as const;

/**
 * `prefix`: começo do rótulo ("Sede: "), que é o cabeçalho de hoje.
 * `line`: rótulo do "endereço numa linha" (fora do padrão de hoje).
 */
export function addressFields<Row>(
    get: (row: Row) => ExportAddress | null | undefined,
    options: {
 prefix: string;
group: string;
privacy: ExportPrivacy;
line: string
},
): ExportField<Row>[] {
    const { prefix, group, privacy } = options;
    const field = (
        key: string,
        header: string,
        pick: (a: ExportAddress) => unknown,
        type: ExportFieldType = 'text',
        weight?: number,
    ): ExportField<Row> => ({
        key,
        label: `${prefix}${header}`,
        group,
        type,
        privacy,
        ...(weight !== undefined && { weight }),
        value: row => {
            const a = get(row);
            return a ? pick(a) : null;
        },
    });
    return [
        field('addressType', 'Tipo', a => label(ADDRESS_TYPE_LABEL, a.type)),
        field('addressStreet', 'Rua', a => a.street),
        field('addressNumber', 'Número', a => a.number, 'text', SHORT_WEIGHT.addressPart),
        field('addressComplement', 'Complemento', a => a.complement),
        field('addressNeighborhood', 'Bairro', a => a.neighborhood),
        field('addressLocality', 'Localidade', a => a.localityName),
        field('addressRoad', 'Estrada', a => a.road),
        field('addressKm', 'Km', a => a.km, 'text', SHORT_WEIGHT.addressPart),
        field('addressLot', 'Lote', a => a.lot, 'text', SHORT_WEIGHT.addressPart),
        field('addressSection', 'Seção', a => a.section, 'text', SHORT_WEIGHT.addressPart),
        field('addressCity', 'Cidade', a => a.city),
        field('addressState', 'UF', a => a.state, 'text', SHORT_WEIGHT.addressState),
        field('addressZipCode', 'CEP', a => a.zipCode, 'cep'),
        {
            key: 'addressLine',
            label: options.line,
            group,
            type: 'text',
            privacy,
            weight: 5,
            value: row => addressLine(get(row)),
        },
    ];
}
