// Mensagem em português para o erro de validação do JSON schema (Ajv). O
// Fastify entrega "body must have required property 'name'" e afins, em
// inglês, direto para o usuário.

type AjvIssue = {
    keyword?: string;
    instancePath?: string;
    params?: Record<string, unknown>;
    message?: string;
};

function campo(issue: AjvIssue): string {
    const missing = issue.params?.missingProperty;
    const path = (issue.instancePath ?? '').replace(/^\//, '').replace(/\//g, '.');
    if (typeof missing === 'string') return path ? `${path}.${missing}` : missing;
    return path;
}

export function validationMessage(validation: unknown, fallback: string): string {
    const issue = Array.isArray(validation) ? (validation[0] as AjvIssue | undefined) : undefined;
    if (!issue?.keyword) return fallback;
    const nome = campo(issue);
    const em = nome ? ` em "${nome}"` : '';
    const p = issue.params ?? {};
    switch (issue.keyword) {
        case 'required':
            return `Informe o campo "${nome}".`;
        case 'type':
            return `Valor inválido${em}: esperado ${traduzTipo(String(p.type))}.`;
        case 'enum':
            return `Valor não aceito${em}.`;
        case 'format':
        case 'pattern':
            return `Formato inválido${em}.`;
        case 'minLength':
            return `Texto curto demais${em}: mínimo de ${String(p.limit)} caracteres.`;
        case 'maxLength':
            return `Texto longo demais${em}: máximo de ${String(p.limit)} caracteres.`;
        case 'minimum':
            return `Valor menor que o mínimo${em}: ${String(p.limit)}.`;
        case 'maximum':
            return `Valor maior que o máximo${em}: ${String(p.limit)}.`;
        case 'minItems':
            return `Lista curta demais${em}: mínimo de ${String(p.limit)} itens.`;
        case 'maxItems':
            return `Lista longa demais${em}: máximo de ${String(p.limit)} itens.`;
        case 'additionalProperties':
            return `Campo não aceito${typeof p.additionalProperty === 'string' ? `: "${p.additionalProperty}"` : ''}.`;
        default:
            return fallback;
    }
}

function traduzTipo(tipo: string): string {
    const nomes: Record<string, string> = {
        string: 'texto',
        number: 'número',
        integer: 'número inteiro',
        boolean: 'verdadeiro ou falso',
        object: 'objeto',
        array: 'lista',
    };
    return tipo
        .split(',')
        .map(t => nomes[t] ?? t)
        .join(' ou ');
}
