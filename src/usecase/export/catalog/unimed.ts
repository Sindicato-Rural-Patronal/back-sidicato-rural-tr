import { z } from 'zod';
import type { UnimedExportRow } from '../../../ports/external/export-repository.js';
import { describeByLabels, idList, text } from '../filters.js';
import { personFields, reportFields } from './person-fields.js';
import type { ExportField, ExportSource } from './types.js';

// Fonte `unimed`: os beneficiários do plano (permissão READ_USER, a mesma da
// ficha da pessoa). Os campos de pessoa vêm de `person-fields.ts`, todos com a
// permissão da fonte. Privacidade (decisão 006, item 2): o plano e o CNS são
// sensíveis (saúde); o nome da mãe e a matrícula, pessoais.
//
// AS CHAVES SÃO CONTRATO: não se renomeia nem se reaproveita uma chave.

const filters = z.object({
    ids: idList,
    search: text,
});

type UnimedFilters = z.infer<typeof filters>;

const filterLabels = {
    search: 'Busca',
};

const unimedFields: ExportField<UnimedExportRow>[] = [
    // Plano
    { key: 'plano',
label: 'Plano',
group: 'Plano Unimed',
type: 'text',
privacy: 'sensivel',
value: u => u.plano },
    { key: 'dataAdesao',
label: 'Data de adesão',
group: 'Plano Unimed',
type: 'date',
privacy: 'comum',
value: u => u.dataAdesao },
    { key: 'tipoMovimento',
label: 'Tipo de movimento',
group: 'Plano Unimed',
type: 'text',
privacy: 'comum',
weight: 3,
value: u => u.tipoMovimento },
    { key: 'motivo',
label: 'Motivo',
group: 'Plano Unimed',
type: 'text',
privacy: 'comum',
weight: 3,
value: u => u.motivo },
    { key: 'obs',
label: 'Observações',
group: 'Plano Unimed',
type: 'text',
privacy: 'comum',
weight: 4,
value: u => u.obs },
    // "Cadastrado em" é o do cadastro na Unimed; o da pessoa é "Pessoa cadastrada em".
    { key: 'unimedCreatedAt',
label: 'Cadastrado em',
group: 'Plano Unimed',
type: 'datetime',
privacy: 'comum',
value: u => u.createdAt },

    // Documentos do plano (no grupo dos documentos da pessoa: o texto da
    // auditoria cita os documentos primeiro, e a busca por "CNS" acha)
    { key: 'matricula',
label: 'Matrícula',
group: 'Documentos',
type: 'text',
privacy: 'pessoal',
value: u => u.matricula },
    { key: 'cns',
label: 'CNS',
group: 'Documentos',
type: 'cns',
privacy: 'sensivel',
value: u => u.cns },

    // Titular e dependência
    { key: 'titular',
label: 'Titular',
group: 'Titular e dependência',
type: 'text',
privacy: 'comum',
weight: 3,
value: u => u.titularName },
    {
        key: 'tipoDependente',
        label: 'Tipo de dependente',
        group: 'Titular e dependência',
        type: 'text',
        privacy: 'comum',
        value: u => u.tipoDependente,
    },
    {
        key: 'grauDependencia',
        label: 'Grau de dependência',
        group: 'Titular e dependência',
        type: 'text',
        privacy: 'comum',
        value: u => u.grauDependencia,
    },

    // Ficha da Unimed
    { key: 'nomeMae',
label: 'Nome da mãe',
group: 'Ficha da Unimed',
type: 'text',
privacy: 'pessoal',
weight: 3,
value: u => u.nomeMae },
    { key: 'profissao',
label: 'Profissão',
group: 'Ficha da Unimed',
type: 'text',
privacy: 'comum',
value: u => u.profissao },
    { key: 'empresa',
label: 'Empresa',
group: 'Ficha da Unimed',
type: 'text',
privacy: 'comum',
value: u => u.empresa },
    { key: 'contratante',
label: 'Contratante',
group: 'Ficha da Unimed',
type: 'text',
privacy: 'comum',
value: u => u.contratante },
];

/** As 20 colunas de hoje, na ordem de hoje. Congeladas pelo teste de ouro. */
const PADRAO = [
    'name', 'cpf', 'birthDate', 'phone', 'email', 'plano', 'matricula', 'cns', 'nomeMae', 'profissao', 'empresa',
    'contratante', 'tipoMovimento', 'tipoDependente', 'grauDependencia', 'titular', 'dataAdesao', 'motivo', 'obs',
    'unimedCreatedAt',
];

export const unimedSource: ExportSource<UnimedExportRow, UnimedFilters> = {
    dataset: 'unimed',
    filters,
    filterLabels,
    describeFilters: f => describeByLabels(f, filterLabels),
    fields: [
        ...unimedFields,
        ...personFields<UnimedExportRow>(u => u.userData, {
            // "Unimed" (o plano visto da pessoa) repete o "Plano".
            exclude: ['unimedPlan'],
            // Rótulos que colidiriam com os da Unimed ("Observações", "Cadastrado em").
            labels: {
                memberNotes: 'Observações do associado',
                createdAt: 'Pessoa cadastrada em',
                updatedAt: 'Pessoa atualizada em',
            },
        }),
        ...reportFields<UnimedExportRow>(),
    ],
    padrao: PADRAO,
    modelos: [{ id: 'nome-cpf-plano',
name: 'Nome, CPF e plano',
fields: ['name', 'cpf', 'plano'] }],
    query: (repo, { ids, search }, take) => repo.unimed({ ids,
search,
take }),
    firstName: row => row.userData.name,
};
