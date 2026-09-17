// Deriva um rótulo de entidade a partir do caminho da requisição, para a
// trilha de auditoria. Ordem importa (rotas mais específicas primeiro).
// O painel lista esses mesmos nomes no filtro "Tipo" (front: auditoria/index.tsx).
export function deriveAuditEntity(path: string): string {
    const p = path.toLowerCase().split('?')[0];
    if (p.includes('/finance/categories')) return 'Categoria financeira';
    if (p.includes('/finance/accounts')) return 'Caixa';
    if (p.includes('/finance/transfers')) return 'Transferência';
    // Antes de /transactions: anexar comprovante é POST /transactions/:id/attachments.
    if (p.includes('/attachments')) return 'Comprovante';
    if (p.includes('/finance/transactions')) return 'Lançamento';
    // Antes de /properties: endereço/vínculo de empresa aparece como Empresa.
    if (p.includes('/companies') || p.includes('/partners/reorder')) return 'Empresa';
    if (p.includes('/market-quotes')) return 'Cotação';
    if (p.includes('/convenios')) return 'Convênio';
    if (p.includes('/galleries')) return 'Galeria';
    if (p.includes('/public-contacts')) return 'Contato público';
    if (p.includes('/site-settings')) return 'Configurações do site';
    if (p.includes('/invites')) return 'Convite';
    if (p.includes('/unimed')) return 'Beneficiário Unimed';
    if (p.includes('/rooms')) return 'Sala';
    if (p.includes('/rule')) return 'Regra';
    if (p.includes('/instructor')) return 'Instrutor';
    if (p.includes('/news')) return 'Notícia';
    // "/banners" (plural): a capa do curso é /courses/:id/banner e fica em Curso.
    if (p.includes('/banners')) return 'Banner';
    if (p.includes('/messages') || p.includes('/contact')) return 'Mensagem';
    // Antes de /course: inscrições também vivem em /admin/courses/:id/registrations.
    if (p.includes('/register') || p.includes('/registrations')) return 'Inscrição';
    if (p.includes('/properties')) return 'Propriedade';
    if (p.includes('/relations')) return 'Relação';
    // Conta de acesso ao painel: /admin/me, /admin/users e /admin/users/:id (sem sub-rota).
    if (/^\/admin\/me(\/|$)/.test(p) || /^\/admin\/users(\/[^/]+)?$/.test(p)) return 'Administrador';
    if (p.includes('/users')) return 'Usuário';
    if (p.includes('/course')) return 'Curso';
    if (p.includes('/address') || p.includes('/cep')) return 'Endereço';
    return 'Outro';
}

/** Rotas que não entram na trilha de auditoria. */
export function skipAudit(path: string): boolean {
    if (path === '/auth/login' || path === '/auth/refresh') return true; // ruído + sem ator; renovar a sessão não é ação
    if (path.startsWith('/invites/')) return true; // não persistir o token de convite
    if (path.startsWith('/admin/export/')) return true; // a exportação registra a própria linha ("Exportou")
    return false;
}
