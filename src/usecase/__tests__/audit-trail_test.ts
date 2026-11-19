import { describe, it, expect } from 'vitest';
import { deriveAuditEntity, loginAuditMethod, skipAudit } from '../../lib/audit-entity.js';
import { AUDIT_ENTITY_NOUNS, auditRouteKey, describeAuditAction } from '../../lib/audit-sentence.js';
import { closingAuditLabel, loginUsername, shouldLookupTargetLabel } from '../../lib/audit-label.js';
import { addressText, shouldSnapshot } from '../../lib/audit-snapshot.js';
import { AUDIT_FIELD_LABELS } from '../../lib/audit-diff.js';

const ID = '3f2b8c1e-4a5d-4e6f-8a9b-0c1d2e3f4a5b';
const ID2 = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

// Monta a linha como o hook grava: entidade derivada do caminho.
function sentence(method: string, path: string, targetLabel: string | null = null) {
    return describeAuditAction({ method,
path,
entity: deriveAuditEntity(path),
targetLabel });
}

describe('auditoria: entidade pelo caminho', () => {
    it.each([
        ['/admin/site-settings', 'Configurações do site'],
        ['/admin/galleries/' + ID + '/photos', 'Galeria'],
        ['/admin/public-contacts/reorder', 'Contato público'],
        ['/admin/invites', 'Convite'],
        ['/admin/unimed/' + ID, 'Beneficiário Unimed'],
        ['/admin/registrations/' + ID, 'Inscrição'],
        ['/admin/registrations/' + ID + '/confirm', 'Inscrição'],
        ['/admin/courses/' + ID + '/registrations', 'Inscrição'],
        ['/admin/courses/' + ID + '/registrations/confirm-all', 'Inscrição'],
        ['/courses/' + ID + '/register-full', 'Inscrição'],
        ['/admin/courses/' + ID + '/start', 'Curso'],
        ['/courses/' + ID + '/banner', 'Curso'],
        ['/admin/banners/' + ID + '/image', 'Banner'],
        ['/news/' + ID + '/banner', 'Notícia'],
        ['/admin/finance/transactions/' + ID + '/attachments', 'Comprovante'],
        ['/admin/finance/transactions/' + ID, 'Lançamento'],
        ['/admin/finance/closings', 'Fechamento de caixa'],
        ['/admin/finance/closings/' + ID, 'Fechamento de caixa'],
        ['/admin/users', 'Administrador'],
        ['/admin/users/' + ID, 'Administrador'],
        ['/admin/me', 'Administrador'],
        ['/admin/me/avatar', 'Administrador'],
        ['/admin/users/' + ID + '/avatar', 'Usuário'],
        ['/users/' + ID, 'Usuário'],
        ['/admin/users/' + ID + '/instructor', 'Instrutor'],
        ['/admin/contacts/messages/' + ID + '/unread', 'Mensagem'],
        ['/contacts/message', 'Mensagem'],
    ])('%s → %s', (path, entity) => {
        expect(deriveAuditEntity(path)).toBe(entity);
    });

    it('toda entidade derivada tem substantivo e gênero para a frase', () => {
        const paths = [
            '/admin/finance/categories', '/admin/finance/accounts', '/admin/finance/transfers',
            '/admin/finance/attachments/x', '/admin/finance/transactions', '/admin/finance/closings', '/admin/companies', '/admin/market-quotes/daily',
            '/admin/convenios', '/admin/galleries', '/admin/public-contacts', '/admin/site-settings', '/admin/invites',
            '/admin/unimed', '/rooms', '/rules', '/admin/users/x/instructor', '/news', '/admin/banners',
            '/admin/contacts/messages/x', '/admin/registrations/x', '/admin/users/x/properties',
            '/admin/users/x/relations', '/admin/users', '/users', '/courses', '/address/cep/1', '/qualquer', '/auth/login',
        ];
        for (const path of paths) {
            expect(AUDIT_ENTITY_NOUNS[deriveAuditEntity(path)], path).toBeDefined();
        }
    });
});

describe('auditoria: rotas fora da trilha', () => {
    it('login, renovação da sessão, convite público e exportação não entram', () => {
        expect(skipAudit('/auth/login')).toBe(true);
        expect(skipAudit('/auth/refresh')).toBe(true);
        expect(skipAudit('/invites/abc/accept')).toBe(true);
        expect(skipAudit('/admin/export/people')).toBe(true);
        expect(skipAudit('/admin/notifications/read')).toBe(true);
        expect(skipAudit('/users/lookup-cpf')).toBe(true);
        expect(skipAudit('/admin/banners')).toBe(false);
    });

    it('busca o nome do alvo em edição/exclusão e em ação sobre item existente, não na inscrição pública', () => {
        expect(shouldLookupTargetLabel('DELETE', '/admin/banners/' + ID)).toBe(true);
        expect(shouldLookupTargetLabel('PATCH', '/admin/site-settings')).toBe(true);
        expect(shouldLookupTargetLabel('POST', '/admin/courses/' + ID + '/start')).toBe(true);
        expect(shouldLookupTargetLabel('POST', '/admin/banners')).toBe(false);
        expect(shouldLookupTargetLabel('POST', '/courses/' + ID + '/register-full')).toBe(false);
    });
});

describe('auditoria: frase da ação', () => {
    it('troca ids por :id na chave da rota', () => {
        expect(auditRouteKey('patch', `/admin/galleries/${ID}/photos/${ID2}/`)).toBe('PATCH /admin/galleries/:id/photos/:id');
    });

    it('ações especiais pelo caminho', () => {
        expect(sentence('POST', `/admin/courses/${ID}/start`)).toBe('Iniciou o curso');
        expect(sentence('POST', `/admin/courses/${ID}/start`, 'HORTA')).toBe('Iniciou o curso "HORTA"');
        expect(sentence('POST', `/admin/galleries/${ID}/photos`)).toBe('Adicionou foto à galeria');
        expect(sentence('POST', `/admin/galleries/${ID}/photos`, 'FAEP')).toBe('Adicionou foto à galeria "FAEP"');
        expect(sentence('PATCH', `/admin/galleries/${ID}/photos/${ID2}`)).toBe('Editou fotos da galeria');
        expect(sentence('PATCH', `/admin/galleries/${ID}/photos/reorder`)).toBe('Editou fotos da galeria');
        expect(sentence('PATCH', `/admin/contacts/messages/${ID}`)).toBe('Marcou mensagem como lida');
        expect(sentence('PATCH', `/admin/contacts/messages/${ID}/unread`, 'MARIA')).toBe('Marcou como não lida a mensagem de "MARIA"');
        expect(sentence('PATCH', '/admin/site-settings')).toBe('Editou as configurações do site');
        expect(sentence('POST', `/admin/courses/${ID}/registrations`)).toBe('Inscreveu uma pessoa no curso');
        expect(sentence('PATCH', `/admin/courses/${ID}/registrations/confirm-all`)).toBe('Confirmou todas as inscrições');
        expect(sentence('PATCH', `/admin/courses/${ID}/registrations/confirm-all`, 'HORTA')).toBe('Confirmou todas as inscrições do curso "HORTA"');
        expect(sentence('PATCH', `/admin/market-quotes/${ID}`, 'SOJA')).toBe('Alterou a unidade da cotação "SOJA"');
        expect(sentence('PUT', '/admin/market-quotes/daily')).toBe('Lançou as cotações do dia');
        expect(sentence('PATCH', '/admin/me', 'JOAO')).toBe('Editou o próprio perfil');
        expect(sentence('POST', `/courses/${ID}/banner`)).toBe('Trocou a imagem do curso');
    });

    it('demais ações: verbo + artigo pelo gênero + entidade', () => {
        expect(sentence('POST', '/admin/galleries')).toBe('Criou uma galeria');
        expect(sentence('PATCH', `/admin/galleries/${ID}`, 'FAEP')).toBe('Editou a galeria "FAEP"');
        expect(sentence('PATCH', `/admin/public-contacts/${ID}`, 'ZECA')).toBe('Editou o contato público "ZECA"');
        expect(sentence('DELETE', `/admin/unimed/${ID}`, 'ANA')).toBe('Excluiu o beneficiário Unimed "ANA"');
        expect(sentence('POST', '/admin/users', 'joao')).toBe('Criou o administrador "joao"');
        expect(sentence('DELETE', `/rooms/${ID}`)).toBe('Excluiu uma sala');
        expect(sentence('POST', '/qualquer')).toBe('Criou um registro');
        expect(describeAuditAction({ method: 'EXPORT',
path: '/admin/export/people',
entity: 'Exportação',
targetLabel: 'Pessoas: 3 registros' }))
            .toBe('Exportou a planilha "Pessoas: 3 registros"');
    });

    it('linha antiga do CSV do Financeiro (rota apagada na SR-119) continua com a mesma frase', () => {
        // A produção tem linhas gravadas com o caminho antigo; não mudam nem somem da tela.
        const antiga = { method: 'EXPORT',
path: '/admin/finance/transactions/export',
entity: 'Exportação',
targetLabel: 'Lançamentos: 12 registros (todos) · CSV · com CNPJ / CPF',
details: null };
        expect(describeAuditAction(antiga)).toBe('Exportou a planilha "Lançamentos: 12 registros (todos) · CSV · com CNPJ / CPF"');
        expect(describeAuditAction({ ...antiga,
targetLabel: null })).toBe('Exportou uma planilha');
    });

    it('exportação em PDF (details.formato) é relatório, não planilha; o CSV segue planilha', () => {
        const exp = (targetLabel: string | null, details: unknown) =>
            describeAuditAction({ method: 'EXPORT',
path: '/admin/export/people',
entity: 'Exportação',
targetLabel,
details });
        const pdf = { formato: 'pdf',
modelo: null,
campos: ['Nome'],
escopo: 'todos',
filtros: [],
linhas: 4 };
        expect(exp('Pessoas: 4 registros (com filtros) · PDF · com CPF', pdf))
            .toBe('Exportou o relatório em PDF "Pessoas: 4 registros (com filtros) · PDF · com CPF"');
        expect(exp(null, pdf)).toBe('Exportou um relatório em PDF');
        expect(exp('Pessoas: 4 registros (todos) · CSV', { ...pdf,
formato: 'csv' })).toBe('Exportou a planilha "Pessoas: 4 registros (todos) · CSV"');
        // Excel (SR-104): a planilha do Excel.
        expect(exp('Pessoas: 4 registros (todos) · Excel', { ...pdf,
formato: 'xlsx' })).toBe('Exportou a planilha do Excel "Pessoas: 4 registros (todos) · Excel"');
        expect(exp(null, { ...pdf,
formato: 'xlsx' })).toBe('Exportou uma planilha do Excel');
        // Linhas antigas e fontes sem montador: sem details.
        expect(exp(null, null)).toBe('Exportou uma planilha');
        expect(exp(null, [])).toBe('Exportou uma planilha');
        // `details` só conta na exportação.
        expect(describeAuditAction({ method: 'POST',
path: '/admin/galleries',
entity: 'Galeria',
targetLabel: null,
details: pdf })).toBe('Criou uma galeria');
    });

    it('entidade desconhecida (linha antiga) usa o nome em minúsculas', () => {
        expect(describeAuditAction({ method: 'DELETE',
path: '/x',
entity: 'Coisa',
targetLabel: null })).toBe('Excluiu um coisa');
    });
});

describe('auditoria: fechamento do mês (SR-054)', () => {
    it('rótulo "mês · caixa"', () => {
        expect(closingAuditLabel('2026-10', 'BANCO')).toBe('10/2026 · BANCO');
        expect(closingAuditLabel('2026-10', null)).toBe('10/2026');
    });

    it('fechar e reabrir têm frase própria', () => {
        expect(sentence('POST', '/admin/finance/closings', '10/2026 · BANCO')).toBe('Fechou o mês "10/2026 · BANCO"');
        expect(sentence('POST', '/admin/finance/closings')).toBe('Fechou o mês de um caixa');
        expect(sentence('DELETE', `/admin/finance/closings/${ID}`, '10/2026 · BANCO')).toBe('Reabriu o mês "10/2026 · BANCO"');
        expect(sentence('DELETE', `/admin/finance/closings/${ID}`)).toBe('Reabriu o mês de um caixa');
    });

    it('fechar busca o rótulo (caixa do corpo); reabrir guarda o que estava fechado', () => {
        expect(shouldLookupTargetLabel('POST', '/admin/finance/closings')).toBe(true);
        expect(shouldLookupTargetLabel('DELETE', `/admin/finance/closings/${ID}`)).toBe(true);
        expect(shouldSnapshot('DELETE', `/admin/finance/closings/${ID}`)).toBe(true);
    });
});

describe('auditoria: modelo de relatório da equipe (SR-114)', () => {
    it('entidade própria, mesmo com o conjunto no caminho (registrations, companies, courses…)', () => {
        for (const dataset of ['people', 'registrations', 'companies', 'courses', 'contact-messages', 'unimed']) {
            expect(deriveAuditEntity(`/admin/report-templates/${dataset}`), dataset).toBe('Modelo de relatório');
            expect(deriveAuditEntity(`/admin/report-templates/${dataset}/${ID}`), dataset).toBe('Modelo de relatório');
        }
        expect(AUDIT_ENTITY_NOUNS['Modelo de relatório']).toEqual({ noun: 'modelo de relatório',
g: 'm' });
        expect(skipAudit('/admin/report-templates/people')).toBe(false);
    });

    it('nos Lançamentos, o modelo da equipe é a "Visão da lista" (decisão 007)', () => {
        expect(deriveAuditEntity('/admin/report-templates/finance-transactions')).toBe('Visão da lista');
        expect(deriveAuditEntity(`/admin/report-templates/finance-transactions/${ID}`)).toBe('Visão da lista');
        expect(AUDIT_ENTITY_NOUNS['Visão da lista']).toEqual({ noun: 'visão',
g: 'f' });
        expect(sentence('POST', '/admin/report-templates/finance-transactions', 'Lançamentos: Contabilidade março'))
            .toBe('Criou a visão "Lançamentos: Contabilidade março"');
        expect(sentence('PATCH', `/admin/report-templates/finance-transactions/${ID}`, 'Lançamentos: Contabilidade'))
            .toBe('Editou a visão "Lançamentos: Contabilidade"');
        expect(sentence('DELETE', `/admin/report-templates/finance-transactions/${ID}`, 'Lançamentos: Contabilidade'))
            .toBe('Excluiu a visão "Lançamentos: Contabilidade"');
        expect(AUDIT_FIELD_LABELS.filters).toBe('Filtros');
        expect(shouldSnapshot('PATCH', `/admin/report-templates/finance-transactions/${ID}`)).toBe(true);
    });

    it('frases de criar, editar e excluir', () => {
        expect(sentence('POST', '/admin/report-templates/people', 'Pessoas: Só os nomes'))
            .toBe('Criou o modelo de relatório "Pessoas: Só os nomes"');
        expect(sentence('PATCH', `/admin/report-templates/registrations/${ID}`, 'Inscrições: Equipe (antes equipe)'))
            .toBe('Editou o modelo de relatório "Inscrições: Equipe (antes equipe)"');
        expect(sentence('DELETE', `/admin/report-templates/people/${ID}`, 'Pessoas: Só os nomes'))
            .toBe('Excluiu o modelo de relatório "Pessoas: Só os nomes"');
        expect(sentence('DELETE', `/admin/report-templates/people/${ID}`)).toBe('Excluiu um modelo de relatório');
    });

    it('editar e excluir guardam o que mudou; criar e listar não', () => {
        expect(shouldSnapshot('PATCH', `/admin/report-templates/people/${ID}`)).toBe(true);
        expect(shouldSnapshot('DELETE', `/admin/report-templates/finance-transactions/${ID}`)).toBe(true);
        expect(shouldSnapshot('POST', '/admin/report-templates/people')).toBe(false);
        expect(shouldSnapshot('PATCH', '/admin/report-templates/people')).toBe(false);
        expect(shouldSnapshot('PATCH', `/admin/report-templates/people/${ID}/outra`)).toBe(false);
    });
});

describe('auditoria: login', () => {
    it('status da resposta vira o tipo da tentativa', () => {
        expect(loginAuditMethod(200)).toBe('LOGIN');
        expect(loginAuditMethod(401)).toBe('LOGIN_FAILED');
        expect(loginAuditMethod(429)).toBe('LOGIN_BLOCKED');
        expect(loginAuditMethod(400)).toBeNull();
        expect(loginAuditMethod(500)).toBeNull();
    });

    it('guarda só o usuário digitado (até 60 caracteres), nunca a senha', () => {
        expect(loginUsername({ username: '  bali  ',
password: 'segredo' })).toBe('bali');
        expect(loginUsername({ username: 'x'.repeat(100) })).toHaveLength(60);
        expect(loginUsername({ password: 'segredo' })).toBeNull();
        expect(loginUsername(null)).toBeNull();
    });

    it('entidade "Login" e frases das tentativas', () => {
        expect(deriveAuditEntity('/auth/login')).toBe('Login');
        expect(sentence('LOGIN', '/auth/login', 'bali')).toBe('Entrou no painel');
        expect(sentence('LOGIN_FAILED', '/auth/login', 'bali')).toBe('Tentativa de login falhou (usuário "bali")');
        expect(sentence('LOGIN_FAILED', '/auth/login')).toBe('Tentativa de login falhou');
        expect(sentence('LOGIN_FAILED', '/auth/login', '(usuário inexistente)')).toBe('Tentativa de login falhou (usuário inexistente)');
        expect(sentence('LOGIN_BLOCKED', '/auth/login', 'bali')).toBe('Login bloqueado por excesso de tentativas (usuário "bali")');
    });
});

describe('auditoria: presença e conclusão do curso', () => {
    it('frases das novas rotas', () => {
        expect(sentence('PATCH', `/admin/registrations/${ID}/attendance`)).toBe('Marcou presença na inscrição');
        expect(sentence('PATCH', `/admin/registrations/${ID}/attendance`, 'MARIA')).toBe('Marcou presença na inscrição de "MARIA"');
        expect(sentence('PATCH', `/admin/courses/${ID}/registrations/attendance`)).toBe('Marcou presença de todos os confirmados');
        expect(sentence('PATCH', `/admin/courses/${ID}/complete`, 'HORTA')).toBe('Concluiu o curso "HORTA"');
        expect(deriveAuditEntity(`/admin/registrations/${ID}/attendance`)).toBe('Inscrição');
        expect(deriveAuditEntity(`/admin/courses/${ID}/complete`)).toBe('Curso');
    });
});

describe('auditoria: leitura de antes/depois', () => {
    it('edições e exclusões de um registro identificável', () => {
        expect(shouldSnapshot('PATCH', `/users/${ID}`)).toBe(true);
        expect(shouldSnapshot('DELETE', `/admin/companies/${ID}/members/${ID2}`)).toBe(true);
        expect(shouldSnapshot('PATCH', `/admin/registrations/${ID}/attendance`)).toBe(true);
        expect(shouldSnapshot('PATCH', `/admin/courses/${ID}/complete`)).toBe(true);
        expect(shouldSnapshot('PATCH', '/admin/site-settings')).toBe(true);
        expect(shouldSnapshot('PUT', '/admin/market-quotes/daily')).toBe(true);
        expect(shouldSnapshot('PATCH', '/admin/me')).toBe(true);
    });

    it('criação, reordenação e ações em lote ficam de fora', () => {
        expect(shouldSnapshot('POST', '/admin/banners')).toBe(false);
        expect(shouldSnapshot('POST', `/admin/courses/${ID}/start`)).toBe(false);
        expect(shouldSnapshot('PATCH', '/admin/banners/reorder')).toBe(false);
        expect(shouldSnapshot('PATCH', `/admin/courses/${ID}/registrations/attendance`)).toBe(false);
        expect(shouldSnapshot('PATCH', `/admin/courses/${ID}/registrations/confirm-all`)).toBe(false);
    });

    it('endereço em uma linha', () => {
        expect(addressText({ street: 'RUA JOSÉ TONDATO',
number: '80',
neighborhood: 'CENTRO',
city: 'TERRA ROXA',
state: 'PR',
zipCode: '85990000' }))
            .toBe('RUA JOSÉ TONDATO, 80 - CENTRO - TERRA ROXA/PR - CEP 85990000');
        expect(addressText(null)).toBeNull();
        expect(addressText({})).toBeNull();
    });
});
