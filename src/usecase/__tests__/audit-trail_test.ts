import { describe, it, expect } from 'vitest';
import { deriveAuditEntity, loginAuditMethod, skipAudit } from '../../lib/audit-entity.js';
import { AUDIT_ENTITY_NOUNS, auditRouteKey, describeAuditAction } from '../../lib/audit-sentence.js';
import { loginUsername, shouldLookupTargetLabel } from '../../lib/audit-label.js';
import { addressText, shouldSnapshot } from '../../lib/audit-snapshot.js';

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
            '/admin/finance/attachments/x', '/admin/finance/transactions', '/admin/companies', '/admin/market-quotes/daily',
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
        expect(skipAudit('/admin/banners')).toBe(false);
    });

    it('busca o nome do alvo em edição/exclusão e em ação sobre item existente, não na inscrição pública', () => {
        expect(shouldLookupTargetLabel('DELETE', '/admin/banners/' + ID)).toBe(true);
        expect(shouldLookupTargetLabel('PATCH', '/admin/site-settings')).toBe(true);
        expect(shouldLookupTargetLabel('POST', '/admin/courses/' + ID + '/start')).toBe(true);
        expect(shouldLookupTargetLabel('POST', '/admin/banners')).toBe(false);
        expect(shouldLookupTargetLabel('POST', '/courses/' + ID + '/register')).toBe(false);
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

    it('entidade desconhecida (linha antiga) usa o nome em minúsculas', () => {
        expect(describeAuditAction({ method: 'DELETE',
path: '/x',
entity: 'Coisa',
targetLabel: null })).toBe('Excluiu um coisa');
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
