// Frase legível ("Iniciou o curso "HORTA"") para cada linha da trilha de
// auditoria. Calculada na leitura a partir do que já é gravado (método, caminho,
// entidade e rótulo do alvo), então vale também para as linhas antigas.

type Gender = 'm' | 'f' | 'fp';

/** Substantivo e gênero de cada entidade de `deriveAuditEntity` (+ "Exportação"). */
export const AUDIT_ENTITY_NOUNS: Record<string, {
 noun: string;
g: Gender 
}> = {
    'Administrador': { noun: 'administrador',
g: 'm' },
    'Banner': { noun: 'banner',
g: 'm' },
    'Beneficiário Unimed': { noun: 'beneficiário Unimed',
g: 'm' },
    'Caixa': { noun: 'caixa',
g: 'm' },
    'Categoria financeira': { noun: 'categoria financeira',
g: 'f' },
    'Comprovante': { noun: 'comprovante',
g: 'm' },
    'Configurações do site': { noun: 'configurações do site',
g: 'fp' },
    'Contato público': { noun: 'contato público',
g: 'm' },
    'Convênio': { noun: 'convênio',
g: 'm' },
    'Convite': { noun: 'convite',
g: 'm' },
    'Cotação': { noun: 'cotação',
g: 'f' },
    'Curso': { noun: 'curso',
g: 'm' },
    'Empresa': { noun: 'empresa',
g: 'f' },
    'Endereço': { noun: 'endereço',
g: 'm' },
    'Exportação': { noun: 'planilha',
g: 'f' },
    'Galeria': { noun: 'galeria',
g: 'f' },
    'Inscrição': { noun: 'inscrição',
g: 'f' },
    'Instrutor': { noun: 'instrutor',
g: 'm' },
    'Lançamento': { noun: 'lançamento',
g: 'm' },
    'Mensagem': { noun: 'mensagem',
g: 'f' },
    'Notícia': { noun: 'notícia',
g: 'f' },
    'Propriedade': { noun: 'propriedade',
g: 'f' },
    'Regra': { noun: 'regra',
g: 'f' },
    'Relação': { noun: 'relação',
g: 'f' },
    'Sala': { noun: 'sala',
g: 'f' },
    'Transferência': { noun: 'transferência',
g: 'f' },
    'Usuário': { noun: 'usuário',
g: 'm' },
    'Outro': { noun: 'registro',
g: 'm' },
};

const VERB: Record<string, string> = {
    POST: 'Criou',
    PATCH: 'Editou',
    PUT: 'Editou',
    DELETE: 'Excluiu',
    EXPORT: 'Exportou',
};

type Sentence = (label: string | null) => string;

const q = (label: string) => `"${label}"`;
/** Frase fixa; com rótulo, acrescenta `complemento "rótulo"` (ou só o rótulo). */
const fixed = (text: string, withLabel?: string): Sentence => label =>
    label ? `${withLabel ?? text} ${q(label)}` : text;

// Rotas cuja ação não é "criar/editar/excluir <entidade>". Chave: método + caminho
// com os ids trocados por ":id" (ver `auditRouteKey`).
const SPECIAL: Record<string, Sentence> = {
    // Cursos e inscrições
    'POST /admin/courses/:id/start': fixed('Iniciou o curso'),
    'POST /admin/courses/:id/registrations': fixed('Inscreveu uma pessoa no curso'),
    'PATCH /admin/courses/:id/registrations/confirm-all': fixed('Confirmou todas as inscrições', 'Confirmou todas as inscrições do curso'),
    'POST /courses/:id/banner': fixed('Trocou a imagem do curso'),
    'POST /courses/:id/gallery': fixed('Adicionou foto ao curso'),
    'DELETE /courses/:id/gallery/:id': fixed('Excluiu foto do curso'),
    'POST /courses/:id/register': l => (l ? `Inscreveu ${q(l)} em um curso` : 'Fez uma inscrição em curso'),
    'POST /courses/:id/register-by-cpf': l => (l ? `Inscreveu ${q(l)} em um curso` : 'Fez uma inscrição em curso'),
    'POST /courses/:id/register-full': l => (l ? `Inscreveu ${q(l)} em um curso` : 'Fez uma inscrição em curso'),
    'DELETE /admin/registrations/:id': fixed('Cancelou uma inscrição', 'Cancelou a inscrição de'),
    'PATCH /admin/registrations/:id/confirm': fixed('Alterou a confirmação de uma inscrição', 'Alterou a confirmação da inscrição de'),
    'POST /admin/registrations/:id/ficha': fixed('Anexou a ficha de uma inscrição', 'Anexou a ficha de inscrição de'),
    'DELETE /admin/registrations/:id/ficha': fixed('Removeu a ficha de uma inscrição', 'Removeu a ficha de inscrição de'),
    'POST /admin/courses/:id/instructors': fixed('Adicionou instrutor ao curso'),
    'DELETE /admin/courses/:id/instructors/:id': fixed('Removeu instrutor do curso'),

    // Instrutores (cadastro da pessoa)
    'POST /admin/users/:id/instructor': l => (l ? `Tornou ${q(l)} instrutor` : 'Cadastrou um instrutor'),
    'DELETE /admin/users/:id/instructor': l => (l ? `Removeu ${q(l)} dos instrutores` : 'Removeu um instrutor'),

    // Pessoas e administradores
    'POST /admin/users/:id/avatar': fixed('Trocou a foto de um usuário', 'Trocou a foto de'),
    'PATCH /admin/me': () => 'Editou o próprio perfil',
    'POST /admin/me/avatar': () => 'Trocou a própria foto',

    // Mensagens de contato
    'POST /contacts/message': l => (l ? `Mensagem de ${q(l)} enviada pelo site` : 'Enviou uma mensagem pelo site'),
    'PATCH /admin/contacts/messages/:id': fixed('Marcou mensagem como lida', 'Marcou como lida a mensagem de'),
    'PATCH /admin/contacts/messages/:id/unread': fixed('Marcou mensagem como não lida', 'Marcou como não lida a mensagem de'),
    'DELETE /admin/contacts/messages/:id': fixed('Excluiu uma mensagem', 'Excluiu a mensagem de'),

    // Site: configurações, banners, galerias, parceiros e contatos públicos
    'PATCH /admin/site-settings': () => 'Editou as configurações do site',
    'PATCH /admin/banners/reorder': () => 'Reordenou os banners',
    'POST /admin/banners/:id/image': fixed('Trocou a imagem do banner'),
    'PATCH /admin/galleries/reorder': () => 'Reordenou as galerias',
    'POST /admin/galleries/:id/photos': fixed('Adicionou foto à galeria'),
    'PATCH /admin/galleries/:id/photos/:id': fixed('Editou fotos da galeria'),
    'PATCH /admin/galleries/:id/photos/reorder': fixed('Editou fotos da galeria'),
    'DELETE /admin/galleries/:id/photos/:id': fixed('Excluiu foto da galeria'),
    'PATCH /admin/partners/reorder': () => 'Reordenou os parceiros',
    'POST /admin/companies/:id/partner-logo': fixed('Trocou o logo de parceira de uma empresa', 'Trocou o logo de parceira da empresa'),
    'POST /admin/public-contacts': l => (l ? `Adicionou contato público com o cargo ${q(l)}` : 'Adicionou um contato público'),
    'PATCH /admin/public-contacts/reorder': () => 'Reordenou os contatos públicos',
    'DELETE /admin/public-contacts/:id': l => (l ? `Tirou ${q(l)} dos contatos públicos` : 'Tirou uma pessoa dos contatos públicos'),

    // Empresas: vínculos e propriedades
    'POST /admin/companies/:id/members': fixed('Vinculou uma pessoa a uma empresa', 'Vinculou uma pessoa à empresa'),
    'PATCH /admin/companies/:id/members/:id': fixed('Editou o vínculo de uma pessoa com uma empresa', 'Editou o vínculo de uma pessoa com a empresa'),
    'DELETE /admin/companies/:id/members/:id': fixed('Desvinculou uma pessoa de uma empresa', 'Desvinculou uma pessoa da empresa'),
    'POST /admin/companies/:id/properties': fixed('Adicionou propriedade a uma empresa', 'Adicionou propriedade à empresa'),
    'DELETE /admin/companies/:id/properties/:id': fixed('Removeu propriedade de uma empresa', 'Removeu propriedade da empresa'),

    // Cotações
    'PUT /admin/market-quotes/daily': () => 'Lançou as cotações do dia',
    'PATCH /admin/market-quotes/:id': fixed('Alterou a unidade da cotação'),
    'PUT /admin/market-quotes/source': () => 'Alterou a fonte das cotações',

    // Notícias, convênios, financeiro e convites
    'POST /news/:id/banner': fixed('Trocou a imagem da notícia'),
    'POST /news/:id/image': fixed('Enviou imagem para a notícia'),
    'POST /admin/convenios/:id/logo': fixed('Trocou o logo do convênio'),
    'POST /admin/finance/transactions/:id/attachments': fixed('Anexou comprovante ao lançamento'),
    'POST /admin/invites': () => 'Gerou um convite de acesso ao painel',
    'DELETE /admin/invites/:id': fixed('Cancelou um convite de acesso ao painel', 'Cancelou o convite de acesso de'),
};

const UUID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** "PATCH /admin/galleries/<uuid>/photos/<uuid>" → "PATCH /admin/galleries/:id/photos/:id". */
export function auditRouteKey(method: string, path: string): string {
    const clean = path.split('?')[0].replace(/\/+$/, '');
    const normalized = clean
        .split('/')
        .map(seg => (UUID_SEGMENT.test(seg) ? ':id' : seg))
        .join('/');
    return `${method.toUpperCase()} ${normalized}`;
}

/** Frase da ação para o painel e a planilha. `targetLabel` null → frase sem o nome do alvo. */
export function describeAuditAction(entry: {
    method: string;
    path: string;
    entity: string;
    targetLabel: string | null;
}): string {
    const label = entry.targetLabel?.trim() || null;
    const special = SPECIAL[auditRouteKey(entry.method, entry.path)];
    if (special) return special(label);

    const verb = VERB[entry.method] ?? entry.method;
    const e = AUDIT_ENTITY_NOUNS[entry.entity] ?? { noun: entry.entity.toLowerCase(),
g: 'm' as const };
    if (label) {
        const article = e.g === 'fp' ? 'as' : e.g === 'f' ? 'a' : 'o';
        return `${verb} ${article} ${e.noun} ${q(label)}`;
    }
    const article = e.g === 'fp' ? 'as' : e.g === 'f' ? 'uma' : 'um';
    return `${verb} ${article} ${e.noun}`;
}
