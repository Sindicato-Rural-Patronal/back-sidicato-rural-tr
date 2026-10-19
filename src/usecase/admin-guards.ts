import type { UserAdminModel } from '../generated/prisma/models/UserAdmin.js';
import type { UserAdminRepository } from '../ports/external/user-admin-repository.js';
import type { RuleRepository } from '../ports/external/rule-repository.js';
import { ForbiddenError } from '../errors/auth.js';
import { ValidationError } from '../errors/validation.js';

// Anti-escalonamento entre administradores. As permissões não são
// hierárquicas, então "mais forte" quer dizer: tem alguma permissão que o ator
// não tem. Quem pede só mexe em admin ou regra contido nas próprias permissões.

/** `permissions` tem alguma permissão que o ator não tem. */
export function exceedsActor(permissions: readonly string[], actorPermissions: readonly string[]): boolean {
    return permissions.some(p => !actorPermissions.includes(p));
}

/** Permissões da regra do admin (vazio se a regra não existe mais). */
export async function permissionsOfAdmin(ruleRepository: RuleRepository, admin: Pick<UserAdminModel, 'rulesId'>) {
    const rule = await ruleRepository.findById(admin.rulesId);
    return (rule?.permissions as string[] | undefined) ?? [];
}

const REMOVAL_MESSAGES = {
    admin: {
        self: 'Você não pode excluir a sua própria conta de administrador.',
        stronger: 'Você não pode excluir um administrador com permissões além das suas.',
        last: 'Não é possível excluir o último administrador ativo.',
    },
    person: {
        self: 'Você não pode excluir o seu próprio cadastro: ele é o seu acesso ao painel.',
        stronger: 'Esta pessoa é administradora com permissões além das suas: você não pode excluí-la.',
        last: 'Esta pessoa é o último administrador ativo: excluí-la deixaria o painel sem acesso.',
    },
} as const;

/**
 * Travas para tirar o acesso de um administrador, seja excluindo o admin, seja
 * excluindo a pessoa dele (que leva o login junto): não a si mesmo, não quem tem
 * permissões além das do ator e nunca o último admin ativo. Devolve o erro ou null.
 */
export async function checkAdminRemoval(
    deps: {
 userAdminRepository: UserAdminRepository;
ruleRepository: RuleRepository 
},
    target: UserAdminModel,
    actor: {
 id: string;
permissions: readonly string[] 
},
    via: keyof typeof REMOVAL_MESSAGES,
): Promise<Error | null> {
    const messages = REMOVAL_MESSAGES[via];
    if (target.id === actor.id) return new ValidationError(messages.self);

    const targetPermissions = await permissionsOfAdmin(deps.ruleRepository, target);
    if (exceedsActor(targetPermissions, actor.permissions)) return new ForbiddenError(messages.stronger);

    if ((await deps.userAdminRepository.count()) <= 1) return new ValidationError(messages.last);
    return null;
}
