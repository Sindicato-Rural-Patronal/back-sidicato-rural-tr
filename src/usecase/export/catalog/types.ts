import type { z } from 'zod';
import type { Permission } from '../../../generated/prisma/enums.js';
import type { ExportRepository } from '../../../ports/external/export-repository.js';

// Catálogo de campos do montador de relatórios (decisão 006, item 2).

/** O tipo formata a célula; o campo só devolve o valor cru. */
export type ExportFieldType =
    | 'text' | 'number' | 'money' | 'boolean' | 'list'
    | 'date' | 'datetime' | 'wallclock' // dd/mm/aaaa · Brasília · como gravado
    | 'cpf' | 'cnpj' | 'cep' | 'phone' | 'cns' // com máscara
    | 'blank'; // coluna em branco (assinatura)

/** Informação, não bloqueio: etiqueta no montador e texto da auditoria. */
export type ExportPrivacy = 'comum' | 'pessoal' | 'sensivel';

export type ExportFieldContext = {
    /** Hoje em Brasília, 00:00 com Z (`todayInBrazil`). */
    today: Date;
    /** Posição da linha no relatório, a partir de 1 ("Nº de ordem"). */
    index: number;
};

export type ExportField<Row> = {
    /** Estável, nunca renomeada nem reaproveitada: modelo salvo depende dela. */
    key: string;
    /** Cabeçalho da coluna. */
    label: string;
    /** Agrupamento no montador. */
    group: string;
    type: ExportFieldType;
    privacy: ExportPrivacy;
    /** Exigida ALÉM da permissão do conjunto. */
    permission?: Permission;
    /** Largura relativa no PDF. Sem ela, vale a do tipo. */
    weight?: number;
    value: (row: Row, ctx: ExportFieldContext) => unknown;
};

export type ExportModelo = {
    id: string;
    name: string;
    fields: string[];
    /** Só em `registrations`: o modelo liga "Só confirmadas". */
    confirmed?: boolean;
};

/** Um filtro em palavras, para o PDF e a auditoria. */
export type ExportFilterDescription = {
    nome: string;
    valor: string;
};

export type EngineDataset = 'people' | 'registrations' | 'companies';

export type ExportSource<Row, Filters extends { ids?: string[] }> = {
    dataset: EngineDataset;
    /** Os filtros da lista (o zod de hoje); campos desconhecidos são ignorados. */
    filters: z.ZodType<Filters>;
    /** Nome de cada filtro em palavras. */
    filterLabels: Record<string, string>;
    /** `repo`: para o que as linhas não dizem (ex.: o nome do curso sem nenhuma inscrição). */
    describeFilters: (
        filters: Filters,
        rows: Row[],
        repo: ExportRepository,
    ) => ExportFilterDescription[] | Promise<ExportFilterDescription[]>;
    fields: ExportField<Row>[];
    /** As colunas de hoje, na ordem de hoje: o que sai sem `fields`. */
    padrao: string[];
    /** Modelos de fábrica (fora o Padrão). */
    modelos: ExportModelo[];
    /** `take`: o limite de linhas + 1, para saber se passou. */
    query: (repo: ExportRepository, filters: Filters, take: number) => Promise<Row[]>;
    /** Nome do registro, para o arquivo de um registro só. */
    firstName: (row: Row) => string | undefined;
};
