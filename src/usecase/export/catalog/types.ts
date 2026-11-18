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

/**
 * Visão de fábrica da tela (decisão 007): colunas, na ordem, e os filtros que
 * ela liga (as chaves dos filtros da fonte, menos from/to/search/ids, mais
 * `periodo` relativo). `filters: null` = não mexe nos filtros da tela.
 */
export type ExportVisao = {
    id: string;
    name: string;
    fields: string[];
    filters: Record<string, unknown> | null;
};

/** Um filtro em palavras, para o PDF e a auditoria. */
export type ExportFilterDescription = {
    nome: string;
    valor: string;
};

/** Uma linha de total do relatório: o rótulo e o valor em centavos inteiros. */
export type ExportTotalsLine = {
    label: string;
    cents: number;
};

/** Os totais de um relatório (SR-131): as linhas e, se for o caso, a nota que as explica. */
export type ExportTotals = {
    lines: ExportTotalsLine[];
    note?: string;
};

export type EngineDataset =
    | 'people' | 'registrations' | 'companies' | 'properties' | 'admins' | 'courses' | 'contact-messages' | 'unimed'
    | 'audit-logs' | 'room-bookings' | 'finance-transactions';

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
    /**
     * `take`: o limite de linhas + 1, para saber se passou. `now`: o relógio do
     * pedido (os cursos cortam a aba "Armazenados" pelo dia de hoje).
     */
    query: (repo: ExportRepository, filters: Filters, take: number, ctx: { now: Date }) => Promise<Row[]>;
    /** Nome do registro, para o arquivo de um registro só. */
    firstName: (row: Row) => string | undefined;
    /**
     * A mensagem do 400 de filtro inválido. Sem ela, a do zod. O Financeiro
     * usa a de sempre da rota dele: "Parâmetro inválido: <campo>".
     */
    filterMessage?: (issue: {
 path: PropertyKey[];
message: string 
}) => string;
    /**
     * Totais no Excel e no JSON do PDF (SR-131), só quando o campo `key` (um
     * valor em reais) está entre os `fields`. `compute` soma as linhas que
     * saíram, em centavos inteiros; null = sem totais. O CSV não tem totais.
     */
    totals?: {
        key: string;
        compute: (rows: Row[]) => ExportTotals | null;
    };
    /** Parâmetros que só ordenam as linhas: não fazem a exportação ser "com filtros". */
    sortKeys?: string[];
    /**
     * Visões de fábrica da lista (decisão 007), a primeira é a Padrão. Só as
     * fontes cuja lista tem visões (hoje, `finance-transactions`); só elas
     * guardam `filters` nos modelos da equipe.
     */
    visoes?: ExportVisao[];
};
