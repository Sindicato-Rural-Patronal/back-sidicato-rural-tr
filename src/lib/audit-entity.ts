// Deriva um rótulo de entidade a partir do caminho da requisição, para a
// trilha de auditoria. Ordem importa (rotas mais específicas primeiro).
export function deriveAuditEntity(path: string): string {
    const p = path.toLowerCase();
    if (p.includes('/market-quotes')) return 'Cotação';
    if (p.includes('/rooms')) return 'Sala';
    if (p.includes('/rule')) return 'Regra';
    if (p.includes('/instructor')) return 'Instrutor';
    if (p.includes('/news')) return 'Notícia';
    if (p.includes('/banner')) return 'Banner';
    if (p.includes('/messages') || p.includes('/contact')) return 'Mensagem';
    if (p.includes('/register')) return 'Inscrição';
    if (p.includes('/properties')) return 'Propriedade';
    if (p.includes('/relations')) return 'Relação';
    if (p.includes('/users')) return 'Usuário';
    if (p.includes('/course')) return 'Curso';
    if (p.includes('/address') || p.includes('/cep')) return 'Endereço';
    return 'Outro';
}
