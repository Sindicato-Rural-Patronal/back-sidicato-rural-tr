import type { Permission } from '../generated/prisma/enums.js';

// Documentos que o painel monta no navegador, em PDF (decisão 006, item 7.5;
// SR-104). O dado já chegou ao painel por outras rotas; o documento em si não
// passa pela API. Para ficar na auditoria, o painel avisa ao gerar:
// `POST /admin/export/documents/<tipo>` grava a linha EXPORT. Não é barreira,
// é trilha: quem tem a permissão lê os mesmos dados de outro jeito.
//
// O TIPO É CONTRATO: não se renomeia nem se reaproveita (a frase da auditoria
// das linhas antigas sai daqui, pelo caminho gravado).

export type BrowserDocument = {
    /** Nome do documento, na auditoria e em `details.modelo`. */
    name: string;
    /** As mesmas que o painel pede para gerar o documento. */
    permissions: readonly [Permission, ...Permission[]];
    /**
     * Os dados pessoais e sensíveis que o documento mostra, para o alvo da
     * auditoria ("com CPF"), como nas exportações: a busca por "CPF" acha.
     */
    cita: readonly string[];
};

export const BROWSER_DOCUMENTS = {
    // Cursos e inscrições
    'lista-presenca': { name: 'Lista de presença',
permissions: ['READ_COURSE'],
cita: ['CPF'] },
    // Uma ficha ou "Exportar todas as fichas" (lê /admin/users/:id).
    'ficha-inscricao': {
        name: 'Ficha de inscrição',
        permissions: ['READ_COURSE', 'READ_USER'],
        cita: ['CPF', 'Nascimento', 'Telefone', 'E-mail', 'Endereço', 'Etnia', 'Renda familiar'],
    },
    // Painel Geral › Agenda › Imprimir
    agenda: { name: 'Agenda',
permissions: ['READ_COURSE'],
cita: ['Responsável'] },
    // Financeiro
    financeiro: { name: 'Relatório do Financeiro',
permissions: ['READ_FINANCE'],
cita: [] },
    'relatorio-despesas': { name: 'Relatório de despesas',
permissions: ['READ_FINANCE'],
cita: [] },
    // Visão geral › Relatório de receitas: lista o CNPJ / CPF de quem pagou.
    'relatorio-receitas': { name: 'Relatório de receitas',
permissions: ['READ_FINANCE'],
cita: ['CNPJ / CPF'] },
    'nota-empenho': { name: 'Nota de Empenho',
permissions: ['READ_FINANCE'],
cita: ['CNPJ / CPF', 'Endereço', 'Telefone', 'Banco'] },
    recibo: { name: 'Recibo',
permissions: ['READ_FINANCE'],
cita: [] },
    // Unimed (tela e aba Unimed da ficha da pessoa)
    'unimed-ficha': {
        name: 'Ficha da Unimed',
        permissions: ['READ_USER'],
        cita: ['CPF', 'RG', 'CNS', 'Nascimento', 'Nome da mãe', 'Plano'],
    },
    'unimed-termo-adesao': { name: 'Termo de adesão da Unimed',
permissions: ['READ_USER'],
cita: ['CPF', 'RG', 'Endereço', 'Plano'] },
    'unimed-contrato': { name: 'Contrato da Unimed',
permissions: ['READ_USER'],
cita: ['CPF', 'RG', 'Telefone', 'Plano'] },
    // Usuários › Relatório de cadastros › PDF (montado do CSV de /admin/export/cadastros)
    'relatorio-cadastros': {
        name: 'Relatório de cadastros em PDF',
        permissions: ['READ_USER_ADMIN', 'READ_USER'],
        cita: ['CPF', 'RG', 'Nascimento', 'Telefone', 'Endereço', 'Etnia'],
    },
} as const satisfies Record<string, BrowserDocument>;

export type BrowserDocumentKind = keyof typeof BROWSER_DOCUMENTS;

export const BROWSER_DOCUMENT_KINDS = Object.keys(BROWSER_DOCUMENTS) as BrowserDocumentKind[];

/** O caminho gravado na auditoria: `/admin/export/documents/<tipo>`. */
export const BROWSER_DOCUMENTS_PATH = '/admin/export/documents/';

export function isBrowserDocumentKind(value: unknown): value is BrowserDocumentKind {
    return typeof value === 'string' && Object.hasOwn(BROWSER_DOCUMENTS, value);
}

/** O tipo do documento pelo caminho gravado; null se não é linha de documento. */
export function browserDocumentOfPath(path: string): BrowserDocumentKind | null {
    const clean = path.split('?')[0];
    if (!clean.startsWith(BROWSER_DOCUMENTS_PATH)) return null;
    const kind = clean.slice(BROWSER_DOCUMENTS_PATH.length);
    return isBrowserDocumentKind(kind) ? kind : null;
}
