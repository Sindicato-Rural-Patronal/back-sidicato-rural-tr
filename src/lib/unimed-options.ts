// Unimed: listas fixas do formulário (o painel mostra estes valores num select).
// Os valores gravados seguem o padrão dos cadastros: maiúsculo, sem acento — os
// mesmos textos que o sistema legado imprimia na Ficha de Movimentação.
//
// Cadastros antigos podem ter texto livre fora da lista (o campo era aberto).
// Esses valores NÃO se perdem: continuam válidos ao salvar o mesmo registro
// (ver `unimedFieldsIssue`), e o painel os mostra como "(valor antigo)".

export const UNIMED_MOVEMENT_TYPES = [
    'INCLUSAO DE TITULAR',
    'INCLUSAO DE DEPENDENTE',
    'EXCLUSAO DE TITULAR',
    'EXCLUSAO DE DEPENDENTE',
    'ALTERACAO CADASTRAL',
    'REATIVACAO',
] as const;

export const UNIMED_DEPENDENCY_DEGREES = [
    'TITULAR',
    'CONJUGE',
    'FILHO(A)',
    'ENTEADO(A)',
    'PAI/MAE',
    'OUTRO',
] as const;

/** Só os dígitos (o CNS é gravado sem espaços). */
export function onlyDigits(value: string): string {
    return value.replace(/\D/g, '');
}

/** CNS (Cartão Nacional de Saúde) tem 15 dígitos. */
export function isValidCns(value: string): boolean {
    return /^\d{15}$/.test(value);
}

type UnimedCheckFields = {
    tipoMovimento?: string | null;
    grauDependencia?: string | null;
    cns?: string | null;
};

function listed(list: readonly string[], value: string): boolean {
    return list.includes(value);
}

/**
 * Valida os campos de lista fixa e o CNS. `previous` é o registro que está sendo
 * editado: um valor igual ao que já estava gravado passa mesmo fora da lista,
 * para que salvar um cadastro antigo não apague/rejeite o dado histórico.
 * Retorna a mensagem do primeiro problema ou `null` quando está tudo certo.
 */
export function unimedFieldsIssue(
    data: UnimedCheckFields,
    previous?: UnimedCheckFields | null,
): string | null {
    const mov = data.tipoMovimento;
    if (mov && !listed(UNIMED_MOVEMENT_TYPES, mov) && mov !== previous?.tipoMovimento) {
        return `Tipo de movimento inválido. Use: ${UNIMED_MOVEMENT_TYPES.join(', ')}`;
    }

    const grau = data.grauDependencia;
    if (grau && !listed(UNIMED_DEPENDENCY_DEGREES, grau) && grau !== previous?.grauDependencia) {
        return `Grau de dependência inválido. Use: ${UNIMED_DEPENDENCY_DEGREES.join(', ')}`;
    }

    const cns = data.cns;
    if (cns && !isValidCns(cns) && cns !== onlyDigits(previous?.cns ?? '')) {
        return 'CNS deve ter 15 dígitos.';
    }

    return null;
}
