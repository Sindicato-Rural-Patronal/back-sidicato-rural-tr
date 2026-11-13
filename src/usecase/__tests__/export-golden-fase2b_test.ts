import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExportDataUseCase } from '../export-data.js';
import type { ExportRepository } from '../../ports/external/export-repository.js';

// Teste de ouro da fase 2, parte B, do montador de relatórios (decisão 006,
// item 8; SR-102): o CSV padrão de cada fonte que ainda sai pelo caminho
// antigo, byte a byte, com dados fixos. Cada bloco foi escrito e commitado
// ANTES de a fonte dele sair do caminho antigo (`export-data.ts`): sem
// `fields`, a planilha tem de continuar exatamente igual. Se um bloco quebrar,
// a planilha de hoje mudou.
//
// Como nos testes de ouro anteriores, as linhas esperadas estão escritas à
// mão, célula por célula, já como saem no arquivo (aspas internas dobradas,
// fórmula com apóstrofo). Nada de snapshot em arquivo (o `core.autocrlf`
// trocaria o "\r\n").

const repo = {
    people: vi.fn(),
    companies: vi.fn(),
    properties: vi.fn(),
    admins: vi.fn(),
    ruleName: vi.fn(),
    courses: vi.fn(),
    registrations: vi.fn(),
    courseNames: vi.fn(),
    contactMessages: vi.fn(),
    unimed: vi.fn(),
    auditLogs: vi.fn(),
    roomBookings: vi.fn(),
    financeTransactions: vi.fn(),
    logExport: vi.fn(),
} as unknown as ExportRepository;

// 17/09/2026 10:00 em Brasília.
const now = () => new Date('2026-09-17T13:00:00.000Z');
const useCase = () => new ExportDataUseCase(repo, now);

const BOM = '﻿';
/** Uma linha do arquivo: cada célula entre aspas, separadas por ";". */
const line = (cells: string[]) => `${cells.map(c => `"${c}"`).join(';')}\r\n`;
const file = (...lines: string[][]) => BOM + lines.map(line).join('');

const d = (iso: string) => new Date(iso);

beforeEach(() => vi.clearAllMocks());

// ── Auditoria ────────────────────────────────────────────────────────────────

const AUDIT_HEADER = ['Data e hora', 'Quem', 'Ação', 'Área', 'Alvo', 'Caminho', 'IP', 'Local', 'Aparelho', 'Alterações'];

const CHROME_WINDOWS =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const SAFARI_IPHONE =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

/** Exportação em PDF do montador: a coluna "Ação" diz "relatório em PDF". */
const exportPdf = {
    id: 'l1',
    method: 'EXPORT',
    path: '/admin/export/people',
    entity: 'Exportação',
    targetLabel: 'Pessoas: 3 registros (com filtros) · PDF · com CPF',
    ip: '200.1.2.3',
    userAgent: CHROME_WINDOWS,
    location: 'Terra Roxa, PR, Brasil',
    changes: null,
    details: {
        formato: 'pdf',
        modelo: 'Nome e CPF',
        campos: ['Nome', 'CPF'],
        escopo: 'com filtros',
        filtros: [{ nome: 'Busca',
valor: 'silva' }],
        linhas: 3,
    },
    createdAt: d('2026-09-17T13:00:00.000Z'),
    actorName: 'bali',
};

/** Exportação em CSV, com e sem `details` (linha antiga): "planilha". */
const exportCsv = {
    ...exportPdf,
    id: 'l2',
    targetLabel: 'Pessoas: 3 registros (todos) · CSV',
    details: { ...exportPdf.details,
formato: 'csv',
modelo: null,
escopo: 'todos',
filtros: [] },
    createdAt: d('2026-09-17T12:59:00.000Z'),
};
const exportOld = {
    ...exportPdf,
    id: 'l3',
    path: '/admin/export/room-bookings',
    targetLabel: 'Reservas de sala: 2 registros (com filtros)',
    details: null,
    ip: null,
    location: null,
    userAgent: null,
    createdAt: d('2026-09-16T10:00:00.000Z'),
};

/** Edição com alterações; quem fez não existe mais ("—"); alvo com aspas e fórmula. */
const edit = {
    id: 'l4',
    method: 'PATCH',
    path: '/users/0b9f6a52-4d0f-4c1e-9d55-6b5f3c2a1e10',
    entity: 'Usuário',
    targetLabel: '=JOÃO "J"',
    ip: '10.0.0.1',
    userAgent: 'curl/8.4.0',
    location: 'Curitiba, PR, Brasil',
    changes: [
        { field: 'email',
before: 'a@x.com',
after: null },
        { field: 'phone',
before: '44999990000',
after: '44988880000' },
        { field: 'birthDate',
before: null,
after: '1980-05-10' },
    ],
    details: null,
    createdAt: d('2026-01-02T02:05:00.000Z'),
    actorName: '—',
};

/** Login que falhou, sem quem (público), pelo celular. */
const loginFailed = {
    id: 'l5',
    method: 'LOGIN_FAILED',
    path: '/auth/login',
    entity: 'Login',
    targetLabel: '(usuário inexistente)',
    ip: '177.10.20.30',
    userAgent: SAFARI_IPHONE,
    location: 'Toledo, PR, Brasil',
    changes: null,
    details: null,
    createdAt: d('2025-12-31T23:30:00.000Z'),
    actorName: 'Público',
};

/** Excluir a reserva "e as próximas da série" (?scope=future), sem alvo. */
const deleteSeries = {
    id: 'l6',
    method: 'DELETE',
    path: '/admin/room-bookings/7c1d1a0e-1f0e-4d7b-9a51-2f8e3b4c5d60?scope=future',
    entity: 'Reserva de sala',
    targetLabel: null,
    ip: '200.1.2.3',
    userAgent: '',
    location: null,
    changes: [{ field: 'title',
before: 'REUNIÃO; DIRETORIA',
after: null }],
    details: null,
    createdAt: d('2025-06-01T15:00:00.000Z'),
    actorName: 'bali',
};

const EXPORT_PDF_ROW = [
    '17/09/2026 10:00', 'bali', 'Exportou um relatório em PDF', 'Exportação',
    'Pessoas: 3 registros (com filtros) · PDF · com CPF', '/admin/export/people', '200.1.2.3', 'Terra Roxa, PR, Brasil',
    'Chrome no Windows', '',
];
const EXPORT_CSV_ROW = [
    '17/09/2026 09:59', 'bali', 'Exportou uma planilha', 'Exportação', 'Pessoas: 3 registros (todos) · CSV',
    '/admin/export/people', '200.1.2.3', 'Terra Roxa, PR, Brasil', 'Chrome no Windows', '',
];
const EXPORT_OLD_ROW = [
    '16/09/2026 07:00', 'bali', 'Exportou uma planilha', 'Exportação', 'Reservas de sala: 2 registros (com filtros)',
    '/admin/export/room-bookings', '', '', '', '',
];
const EDIT_ROW = [
    '01/01/2026 23:05', '—', 'Editou um usuário', 'Usuário', `'=JOÃO ""J""`, '/users/0b9f6a52-4d0f-4c1e-9d55-6b5f3c2a1e10',
    '10.0.0.1', 'Curitiba, PR, Brasil', 'curl',
    'E-mail: a@x.com → (vazio); Telefone: 44999990000 → 44988880000; birthDate: (vazio) → 1980-05-10',
];
const LOGIN_FAILED_ROW = [
    '31/12/2025 20:30', 'Público', 'Tentativa de login falhou', 'Login', '(usuário inexistente)', '/auth/login',
    '177.10.20.30', 'Toledo, PR, Brasil', 'Safari no iPhone', '',
];
const DELETE_SERIES_ROW = [
    '01/06/2025 12:00', 'bali', 'Excluiu uma reserva de sala e as próximas da série', 'Reserva de sala', '',
    '/admin/room-bookings/7c1d1a0e-1f0e-4d7b-9a51-2f8e3b4c5d60?scope=future', '200.1.2.3', '', '',
    'Título: REUNIÃO; DIRETORIA → (vazio)',
];

describe('teste de ouro: CSV padrão da auditoria', () => {
    it('10 colunas, na ordem e no formato de hoje, na ordem que o repositório entrega', async () => {
        expect(AUDIT_HEADER).toHaveLength(10);
        for (const row of [EXPORT_PDF_ROW, EXPORT_CSV_ROW, EXPORT_OLD_ROW, EDIT_ROW, LOGIN_FAILED_ROW, DELETE_SERIES_ROW]) {
            expect(row).toHaveLength(10);
        }

        vi.mocked(repo.auditLogs).mockResolvedValue([exportPdf, exportCsv, exportOld, edit, loginFailed, deleteSeries] as never);
        const r = await useCase().execute('audit-logs', {});
        expect(r.error).toBeUndefined();
        expect(r.result!.csv).toBe(
            file(AUDIT_HEADER, EXPORT_PDF_ROW, EXPORT_CSV_ROW, EXPORT_OLD_ROW, EDIT_ROW, LOGIN_FAILED_ROW, DELETE_SERIES_ROW),
        );
        expect(r.result!.count).toBe(6);
        expect(r.result!.filename).toBe('auditoria-2026-09-17.csv');
    });

    it('os filtros da tela chegam ao repositório; a página da lista não vira filtro', async () => {
        vi.mocked(repo.auditLogs).mockResolvedValue([edit] as never);
        const filters = {
            action: 'edit',
            entity: 'Usuário',
            actorId: 'a1',
            ip: '10.0.0.1',
            from: '2026-01-01',
            to: '2026-01-31',
            q: 'joão',
        };
        const r = await useCase().execute('audit-logs', { ...filters,
page: '3' });
        expect(r.result!.csv).toBe(file(AUDIT_HEADER, EDIT_ROW));
        expect(r.result!.filename).toBe('auditoria-2026-09-17.csv');
        expect(repo.auditLogs).toHaveBeenCalledWith(expect.objectContaining(filters));
        expect(vi.mocked(repo.auditLogs).mock.calls[0][0]).not.toHaveProperty('page');
    });

    it('lista vazia: só o cabeçalho', async () => {
        vi.mocked(repo.auditLogs).mockResolvedValue([] as never);
        const r = await useCase().execute('audit-logs', { action: 'login_failed' });
        expect(r.result!.csv).toBe(file(AUDIT_HEADER));
        expect(r.result!.count).toBe(0);
    });

    it('filtro inválido → 400, sem consultar', async () => {
        for (const query of [{ action: 'tudo' }, { from: 'ontem' }]) {
            const r = await useCase().execute('audit-logs', query);
            expect(r.error!.message).toBeTruthy();
            expect(repo.auditLogs).not.toHaveBeenCalled();
        }
    });
});

// ── Reservas de sala ─────────────────────────────────────────────────────────

const BOOKINGS_HEADER = ['Tipo', 'Título', 'Sala', 'Início', 'Término', 'Responsável', 'Descrição', 'Série'];

/** Evento de uma série, com responsável cadastrado (o nome vem da pessoa). */
const palestra = {
    id: 'b1',
    type: 'EVENT',
    title: 'Palestra "Solo"; manejo',
    description: 'Trazer projetor',
    publicOnSite: true,
    publicDescription: 'Aberta ao público',
    roomId: 'r1',
    roomName: 'AUDITORIO',
    startTime: d('2026-10-05T08:00:00.000Z'),
    endTime: d('2026-10-05T12:00:00.000Z'),
    responsible: { id: 'p1',
name: 'JOÃO DA SILVA' },
    responsibleName: 'NOME DIGITADO ANTES',
    seriesId: 's1',
};

/** Reunião avulsa, responsável só digitado; título e descrição que viram fórmula. */
const reuniao = {
    id: 'b2',
    type: 'MEETING',
    title: '=Reunião da diretoria',
    description: '-pauta: contas',
    publicOnSite: false,
    publicDescription: null,
    roomId: 'r2',
    roomName: 'SALA 1',
    startTime: d('2026-10-06T19:30:00.000Z'),
    endTime: d('2026-10-06T21:00:00.000Z'),
    responsible: null,
    responsibleName: 'FORNECEDOR X',
    seriesId: null,
};

/** Sem responsável nenhum, entrando pela madrugada (horário de parede, sem fuso). */
const plantao = {
    id: 'b3',
    type: 'EVENT',
    title: 'Plantão',
    description: null,
    publicOnSite: false,
    publicDescription: null,
    roomId: 'r2',
    roomName: 'SALA 1',
    startTime: d('2026-10-06T23:00:00.000Z'),
    endTime: d('2026-10-07T01:30:00.000Z'),
    responsible: null,
    responsibleName: null,
    seriesId: null,
};

const PALESTRA_ROW = [
    'Evento', 'Palestra ""Solo""; manejo', 'AUDITORIO', '05/10/2026 08:00', '05/10/2026 12:00', 'JOÃO DA SILVA',
    'Trazer projetor', 'Sim',
];
const REUNIAO_ROW = [
    'Reunião', `'=Reunião da diretoria`, 'SALA 1', '06/10/2026 19:30', '06/10/2026 21:00', 'FORNECEDOR X', `'-pauta: contas`,
    'Não',
];
const PLANTAO_ROW = ['Evento', 'Plantão', 'SALA 1', '06/10/2026 23:00', '07/10/2026 01:30', '', '', 'Não'];

describe('teste de ouro: CSV padrão das reservas de sala', () => {
    it('8 colunas, na ordem e no formato de hoje; o período vira [de 00:00, até + 1 dia 00:00)', async () => {
        for (const row of [BOOKINGS_HEADER, PALESTRA_ROW, REUNIAO_ROW, PLANTAO_ROW]) expect(row).toHaveLength(8);

        vi.mocked(repo.roomBookings).mockResolvedValue([palestra, reuniao, plantao] as never);
        const r = await useCase().execute('room-bookings', { from: '2026-10-05',
to: '2026-10-11',
roomId: 'r2',
type: 'MEETING',
search: 'reunião' });
        expect(r.error).toBeUndefined();
        expect(r.result!.csv).toBe(file(BOOKINGS_HEADER, PALESTRA_ROW, REUNIAO_ROW, PLANTAO_ROW));
        expect(r.result!.count).toBe(3);
        expect(r.result!.filename).toBe('reservas-de-sala-2026-09-17.csv');
        expect(repo.roomBookings).toHaveBeenCalledWith(expect.objectContaining({
            from: d('2026-10-05T00:00:00.000Z'),
            to: d('2026-10-12T00:00:00.000Z'),
            roomId: 'r2',
            type: 'MEETING',
            search: 'reunião',
        }));
    });

    it('uma reserva pelo id: mesmo arquivo, o título no nome do arquivo', async () => {
        vi.mocked(repo.roomBookings).mockResolvedValue([palestra] as never);
        const r = await useCase().execute('room-bookings', { ids: ['b1'] });
        expect(r.result!.csv).toBe(file(BOOKINGS_HEADER, PALESTRA_ROW));
        expect(r.result!.filename).toBe('reserva-palestra-solo-manejo-2026-09-17.csv');
        expect(repo.roomBookings).toHaveBeenCalledWith(expect.objectContaining({ ids: ['b1'] }));
    });

    it('lista vazia: só o cabeçalho; tipo ou data inválidos → 400 sem consultar', async () => {
        vi.mocked(repo.roomBookings).mockResolvedValue([] as never);
        const r = await useCase().execute('room-bookings', {});
        expect(r.result!.csv).toBe(file(BOOKINGS_HEADER));
        expect(r.result!.count).toBe(0);
        vi.clearAllMocks();
        expect((await useCase().execute('room-bookings', { type: 'CURSO' })).error!.message).toBe('Filtro inválido');
        expect((await useCase().execute('room-bookings', { from: '05/10/2026' })).error!.message).toBe('Data inválida: use AAAA-MM-DD');
        expect(repo.roomBookings).not.toHaveBeenCalled();
    });
});

// ── Lançamentos do Financeiro ────────────────────────────────────────────────

// O CSV saía por `GET /admin/finance/transactions/export`
// (`ExportFinanceTransactionsUseCase`), fora de /admin/export. Desde a SR-102,
// aquela rota e a fonte `finance-transactions` saíam pelo motor: a planilha é o
// padrão da fonte. A rota foi apagada na SR-119. As linhas esperadas abaixo não mudaram com a troca.
async function financeCsv(rows: object[], query: object = {}): Promise<string> {
    vi.mocked(repo.financeTransactions).mockResolvedValue(rows as never);
    const r = await useCase().execute('finance-transactions', query);
    if (r.error) throw r.error;
    return r.result!.csv;
}

const FINANCE_HEADER = [
    'Nº', 'Data', 'Tipo', 'Caixa', 'Categoria', 'Descrição', 'Nome / Razão social', 'CNPJ / CPF', 'Nº anterior', 'Método',
    'Recorrente', 'Valor (R$)', 'Observações',
];

const tx = (over: object) => ({
    id: 'tx',
    number: null,
    type: null,
    amountCents: 0,
    date: d('2026-01-01T00:00:00.000Z'),
    description: '',
    method: null,
    notes: null,
    categoryId: null,
    accountId: null,
    transferId: null,
    createdBy: null,
    recurringId: null,
    recurringMonth: null,
    empenho: null,
    isDeleted: false,
    deletedAt: null,
    createdAt: d('2026-01-01T12:00:00.000Z'),
    updatedAt: d('2026-01-01T12:00:00.000Z'),
    category: null,
    account: null,
    attachments: [],
    ...over,
});

/** Saída com Nota de Empenho completa: razão social, documento e "Nº anterior" aparados; fórmula nas observações. */
const adubo = tx({
    id: 't1',
    number: 128,
    type: 'OUT',
    amountCents: 1234567,
    date: d('2026-05-10T00:00:00.000Z'),
    description: 'Compra de adubo; "NPK"',
    method: 'PIX',
    notes: '=SOMA(A1)',
    category: { name: 'INSUMOS' },
    account: { name: 'BANCO' },
    empenho: { razaoSocial: ' COOP LTDA ',
nomeFantasia: 'COOP',
cnpjCpf: '12.345.678/0001-90',
numero: ' 0045 ',
notaFiscal: '99' },
});

/** Entrada recorrente, sem caixa nem categoria; sem razão social, vale o nome fantasia; CPF como digitado. */
const mensalidade = tx({
    id: 't2',
    number: 7,
    type: 'IN',
    amountCents: 5,
    date: d('2026-01-31T00:00:00.000Z'),
    description: 'Mensalidade',
    recurringId: 'r1',
    recurringMonth: '2026-01',
    empenho: { nomeFantasia: 'MECANICA DO ZE',
cnpjCpf: '52998224725' },
});

/** "Só nota", sem número; descrição que vira fórmula. */
const nota = tx({
    id: 't3',
    amountCents: 100000,
    date: d('2026-03-15T00:00:00.000Z'),
    description: '-desconto',
    method: 'Cheque',
    account: { name: 'CAIXA' },
});

/** Empenho com valores que não são texto (JSON livre): ficam vazios; documento que vira fórmula. */
const estranho = tx({
    id: 't4',
    number: 3,
    type: 'OUT',
    amountCents: 99,
    date: d('2025-12-31T00:00:00.000Z'),
    description: 'Ajuste',
    empenho: { razaoSocial: 42,
nomeFantasia: ['x'],
cnpjCpf: '=1+1',
numero: 45 },
});

const ADUBO_ROW = [
    '128', '10/05/2026', 'Saída', 'BANCO', 'INSUMOS', 'Compra de adubo; ""NPK""', 'COOP LTDA', '12.345.678/0001-90', '0045', 'PIX',
    'Não', '12.345,67', `'=SOMA(A1)`,
];
const MENSALIDADE_ROW = ['7', '31/01/2026', 'Entrada', '', '', 'Mensalidade', 'MECANICA DO ZE', '52998224725', '', '', 'Sim', '0,05', ''];
const NOTA_ROW = ['', '15/03/2026', 'Nota', 'CAIXA', '', `'-desconto`, '', '', '', 'Cheque', 'Não', '1.000,00', ''];
const ESTRANHO_ROW = ['3', '31/12/2025', 'Saída', '', '', 'Ajuste', '', `'=1+1`, '', '', 'Não', '0,99', ''];

describe('teste de ouro: CSV dos lançamentos do Financeiro', () => {
    it('13 colunas, na ordem e no formato de hoje, na ordem que o repositório entrega', async () => {
        for (const row of [FINANCE_HEADER, ADUBO_ROW, MENSALIDADE_ROW, NOTA_ROW, ESTRANHO_ROW]) expect(row).toHaveLength(13);
        const csv = await financeCsv([adubo, nota, mensalidade, estranho], { orderBy: 'date' });
        expect(csv).toBe(file(FINANCE_HEADER, ADUBO_ROW, NOTA_ROW, MENSALIDADE_ROW, ESTRANHO_ROW));
    });

    it('lista vazia: só o cabeçalho', async () => {
        expect(await financeCsv([], { search: 'ninguém' })).toBe(file(FINANCE_HEADER));
    });

    // A fonte nova do montador (SR-102): sem `fields`, a mesma planilha.
    it('a fonte `finance-transactions` do montador, sem fields, sai igual, com o nome de arquivo do montador', async () => {
        vi.mocked(repo.financeTransactions).mockResolvedValue([adubo, nota, mensalidade, estranho] as never);
        const r = await useCase().execute('finance-transactions', { orderBy: 'date' });
        expect(r.error).toBeUndefined();
        expect(r.result!.csv).toBe(file(FINANCE_HEADER, ADUBO_ROW, NOTA_ROW, MENSALIDADE_ROW, ESTRANHO_ROW));
        expect(r.result!.count).toBe(4);
        expect(r.result!.filename).toBe('lancamentos-2026-09-17.csv');
    });
});

// ── Relatório de cadastros ───────────────────────────────────────────────────

// O relatório tem quatro seções. As de pessoas já saem pelo padrão do motor
// (teste de ouro da fase 1); as de empresas e administradores ainda saem pelas
// colunas antigas de export-data.ts. Este bloco congela as duas com linhas de
// verdade (o da fase 1 só tinha empresas vazias).

const PEOPLE_HEADER = [
    'Nome', 'Apelido', 'CPF', 'RG', 'Órgão emissor', 'Emissão do RG', 'Nascimento', 'Sexo', 'Estado civil',
    'Nacionalidade', 'Naturalidade', 'Etnia', 'Escolaridade', 'Necessidades especiais', 'CNH', 'Categoria CNH',
    'E-mail', 'Telefone', 'Telefone 2', 'Telefone 3',
    'Tipo de membro', 'Classificação', 'Categoria funcional', 'Renda familiar', 'CAD/PRO', 'Situação de associado',
    'Associado em dia', 'Associado desde', 'Associado até', 'Nº da observação', 'Observações', 'Diretoria',
    'Cargo na diretoria',
    'Propriedade principal',
    'Endereço: Tipo', 'Endereço: Rua', 'Endereço: Número', 'Endereço: Complemento', 'Endereço: Bairro',
    'Endereço: Localidade', 'Endereço: Estrada', 'Endereço: Km', 'Endereço: Lote', 'Endereço: Seção',
    'Endereço: Cidade', 'Endereço: UF', 'Endereço: CEP',
    'Todas as propriedades', 'Empresas vinculadas', 'Relacionamentos', 'Instrutor', 'Usuário do painel', 'Unimed',
    'Contato público', 'Inscrições em cursos', 'Cadastrado em', 'Atualizado em',
];

const CADASTROS_ADDRESS_HEADERS = ['Tipo', 'Rua', 'Número', 'Complemento', 'Bairro', 'Localidade', 'Estrada', 'Km', 'Lote', 'Seção', 'Cidade', 'UF', 'CEP'];

const CADASTROS_COMPANIES_HEADER = [
    'Razão social', 'Nome fantasia', 'CNPJ', 'Inscrição estadual', 'Tipo', 'E-mail', 'Telefone', 'Telefone 2',
    'Telefone 3', 'Site', ...CADASTROS_ADDRESS_HEADERS.map(h => `Sede: ${h}`), 'Pessoas vinculadas', 'Propriedades', 'Parceira',
    'Link da parceria', 'Observações', 'Cadastrada em', 'Atualizada em',
];

const CADASTROS_ADMINS_HEADER = ['Usuário', 'Nome', 'E-mail', 'CPF', 'Telefone', 'Regra de acesso', 'Criado em'];

/** Empresa com tudo: máscara, sede, vínculos, propriedades, aspas, ";" e fórmula. */
const agroCadastro = {
    id: 'c1',
    name: 'AGRO "BOA" LTDA',
    tradeName: 'AGRO BOA',
    cnpj: '11222333000181',
    stateRegistration: '123.456',
    type: 'PRIVATE',
    email: 'agro@test.com',
    phone: '4436451234',
    phone2: '(44) 99999-0000',
    phone3: '+55 44 3333-2222',
    website: 'https://agro.test',
    notes: '=HYPERLINK("x")',
    isPartner: true,
    partnerUrl: 'https://agro.test/parceria',
    createdAt: d('2026-01-02T15:30:00.000Z'),
    updatedAt: d('2026-03-04T02:05:00.000Z'),
    address: {
        type: 'URBAN',
        street: 'RUA X',
        number: '10',
        complement: 'SALA 2; FUNDOS',
        neighborhood: 'CENTRO',
        localityName: null,
        road: null,
        km: null,
        lot: null,
        section: null,
        city: 'TERRA ROXA',
        state: 'PR',
        zipCode: '85990000',
        notes: 'PORTÃO AZUL',
    },
    members: [
        { title: 'SOCIO',
userData: { name: 'JOÃO',
cpf: '12345678909' } },
        { title: 'GERENTE',
userData: { name: 'MARIA "M"',
cpf: null } },
    ],
    properties: [
        {
            id: 'pr1',
            name: 'FAZENDA',
            registration: '5',
            address: {
                type: 'RURAL',
                street: null,
                number: null,
                complement: null,
                neighborhood: null,
                localityName: 'AGUA DO SOL',
                road: 'ESTRADA BOIADEIRA',
                km: '12',
                lot: '7',
                section: 'B',
                city: 'TERRA ROXA',
                state: 'PR',
                zipCode: '85990000',
                notes: 'PERTO DO RIO',
            },
        },
        { id: 'pr2',
name: 'LOTE',
registration: null,
address: null },
    ],
};

/** Empresa quase vazia; CNPJ antigo, que não tem 14 dígitos, sai como gravado. */
const coopCadastro = {
    id: 'c2',
    name: 'COOP VAZIA',
    tradeName: null,
    cnpj: '12.345/0001',
    stateRegistration: null,
    type: 'PUBLIC',
    email: null,
    phone: null,
    phone2: null,
    phone3: null,
    website: null,
    notes: null,
    isPartner: false,
    partnerUrl: null,
    createdAt: d('2026-09-16T23:30:00.000Z'),
    updatedAt: d('2026-09-16T23:30:00.000Z'),
    address: null,
    members: [],
    properties: [],
};

/** Administradores com a pessoa inteira, como o adapter entrega desde a SR-100. */
const person = (over: object) => ({
    id: 'p',
    name: '',
    nickname: null,
    cpf: null,
    rg: null,
    rgIssuer: null,
    rgIssuedAt: null,
    birthDate: null,
    gender: null,
    maritalStatus: null,
    nationality: null,
    birthPlace: null,
    ethnicity: null,
    educationLevel: null,
    specialNeeds: false,
    driverLicense: null,
    driverLicenseCategory: null,
    email: null,
    phone: '',
    phone2: null,
    phone3: null,
    memberType: null,
    memberClassification: null,
    functionalCategory: null,
    familyIncome: null,
    cadPro: [],
    memberStatus: null,
    memberSince: null,
    membershipValidUntil: null,
    memberNotesNumber: null,
    memberNotes: null,
    boardMember: false,
    boardPosition: null,
    primaryPropertyId: null,
    createdAt: d('2026-01-01T12:00:00.000Z'),
    updatedAt: d('2026-01-01T12:00:00.000Z'),
    properties: [],
    companyMemberships: [],
    relations: [],
    userAdmin: null,
    userInstructor: null,
    unimed: null,
    publicContact: null,
    _count: { courseUserRegistration: 0 },
    ...over,
});

const anaAdmin = {
    id: 'a1',
    username: 'ana.ouro',
    createdAt: d('2026-02-01T10:00:00.000Z'),
    userData: person({ name: 'ANA ADMIN',
email: 'ana@test.com',
cpf: '11144477735',
phone: '44911118010',
rg: '1234567' }),
    rules: { name: 'OURO; LEITURA' },
};
const biaAdmin = {
    id: 'a2',
    username: '=bia',
    createdAt: d('2026-09-16T23:30:00.000Z'),
    userData: person({ name: 'BIA "ADMIN"',
phone: '+55 44 9999' }),
    rules: { name: 'OUTRA' },
};

const AGRO_CADASTRO_ROW = [
    'AGRO ""BOA"" LTDA', 'AGRO BOA', '11.222.333/0001-81', '123.456', 'Privada', 'agro@test.com', '4436451234',
    '(44) 99999-0000', `'+55 44 3333-2222`, 'https://agro.test',
    'Urbano', 'RUA X', '10', 'SALA 2; FUNDOS', 'CENTRO', '', '', '', '', '', 'TERRA ROXA', 'PR', '85990-000',
    'JOÃO (SOCIO) | MARIA ""M"" (GERENTE)',
    'FAZENDA (matrícula 5): ESTRADA BOIADEIRA - AGUA DO SOL, km 12, lote 7, seção B - TERRA ROXA/PR - 85990-000 | LOTE',
    'Sim', 'https://agro.test/parceria', `'=HYPERLINK(""x"")`, '02/01/2026 12:30', '03/03/2026 23:05',
];
const COOP_CADASTRO_ROW = [
    'COOP VAZIA', '', '12.345/0001', '', 'Pública', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '',
    '', '', 'Não', '', '', '16/09/2026 20:30', '16/09/2026 20:30',
];
const ANA_ADMIN_ROW = ['ana.ouro', 'ANA ADMIN', 'ana@test.com', '111.444.777-35', '44911118010', 'OURO; LEITURA', '01/02/2026 07:00'];
const BIA_ADMIN_ROW = [`'=bia`, 'BIA ""ADMIN""', '', '', `'+55 44 9999`, 'OUTRA', '16/09/2026 20:30'];

describe('teste de ouro: relatório de cadastros com empresas e administradores de verdade', () => {
    it('quatro seções; empresas com 30 colunas e administradores com 7, no formato de hoje', async () => {
        for (const row of [CADASTROS_COMPANIES_HEADER, AGRO_CADASTRO_ROW, COOP_CADASTRO_ROW]) expect(row).toHaveLength(30);
        for (const row of [CADASTROS_ADMINS_HEADER, ANA_ADMIN_ROW, BIA_ADMIN_ROW]) expect(row).toHaveLength(7);

        vi.mocked(repo.people).mockResolvedValue([] as never);
        vi.mocked(repo.companies).mockResolvedValue([agroCadastro, coopCadastro] as never);
        vi.mocked(repo.admins).mockResolvedValue([anaAdmin, biaAdmin] as never);
        const r = await useCase().execute('cadastros', {});
        expect(r.error).toBeUndefined();
        expect(r.result!.csv).toBe(
            BOM
                + line(['PESSOAS FISICAS']) + line(PEOPLE_HEADER)
                + '\r\n'
                + line(['ASSOCIADOS EM DIA']) + line(PEOPLE_HEADER)
                + '\r\n'
                + line(['PESSOAS JURIDICAS']) + line(CADASTROS_COMPANIES_HEADER) + line(AGRO_CADASTRO_ROW) + line(COOP_CADASTRO_ROW)
                + '\r\n'
                + line(['ADMINISTRADORES']) + line(CADASTROS_ADMINS_HEADER) + line(ANA_ADMIN_ROW) + line(BIA_ADMIN_ROW),
        );
        expect(r.result!.count).toBe(4);
        expect(r.result!.filename).toBe('relatorio-de-cadastros-2026-09-17.csv');
        expect(r.result!.auditLabel).toBe('Relatório de cadastros: 4 registros (todos)');
        expect(r.result!.auditDetails).toBeNull();
    });

    it('o relatório é sempre o retrato completo: filtro ou seleção não muda a consulta', async () => {
        vi.mocked(repo.people).mockResolvedValue([] as never);
        vi.mocked(repo.companies).mockResolvedValue([] as never);
        vi.mocked(repo.admins).mockResolvedValue([] as never);
        await useCase().execute('cadastros', { search: 'agro',
ids: ['c1'] });
        expect(vi.mocked(repo.people).mock.calls).toEqual([[{}], [{ activeMember: true }]]);
        expect(vi.mocked(repo.companies).mock.calls).toEqual([[{}]]);
        expect(vi.mocked(repo.admins).mock.calls).toEqual([[{}]]);
    });
});
