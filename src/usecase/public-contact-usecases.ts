import { z } from 'zod';
import type {
    PublicContactRepository,
    PublicContactModel,
    PublicContactWithPerson,
} from '../ports/external/public-contact-repository.js';
import type { UserDataRepository } from '../ports/external/user-data-repository.js';
import { ValidationError } from '../errors/validation.js';
import { PublicContactNotFoundError, UserDataNotFoundError } from '../errors/not-found.js';
import { PublicContactAlreadyExistsError } from '../errors/conflict.js';

// Contatos públicos ("Nossa Equipe" na página Contato): qualquer pessoa do
// cadastro, com cargo e ordem. Nome, e-mail e telefone vêm do cadastro.

type Result<T> = { error?: Error } & T;

const title = z.preprocess(
    v => (typeof v === 'string' && v.trim() === '' ? null : v),
    z.string().trim().max(80, 'Cargo muito longo').nullable().optional(),
);

const createSchema = z.object({
    userDataId: z.string().trim().min(1, 'Escolha a pessoa').max(64),
    title,
});
const updateSchema = z.object({ title });
const reorderSchema = z.object({ order: z.array(z.string().trim().min(1).max(64)).min(1, 'Informe a ordem') });

const firstIssue = (e: z.ZodError) => e.issues[0]?.message ?? 'Dados inválidos';

/** Formato do GET /contacts público (o mesmo de antes, mais a foto). */
export type PublicContactItem = {
    publicTitle: string | null;
    userData: {
 name: string;
email: string;
phone: string;
avatar: string | null 
};
};

export class ListPublicContactsUseCase {
    constructor(private readonly repo: PublicContactRepository) {}
    list(): Promise<PublicContactWithPerson[]> {
        return this.repo.list();
    }
    async listPublic(): Promise<PublicContactItem[]> {
        return (await this.repo.list()).map(c => ({
            publicTitle: c.title,
            userData: { name: c.userData.name,
email: c.userData.email,
phone: c.userData.phone,
avatar: c.userData.avatar },
        }));
    }
}

export class AddPublicContactUseCase {
    constructor(
        private readonly repo: PublicContactRepository,
        private readonly people: UserDataRepository,
    ) {}
    async execute(input: unknown): Promise<Result<{ contact?: PublicContactModel }>> {
        const parsed = createSchema.safeParse(input);
        if (!parsed.success) return { error: new ValidationError(firstIssue(parsed.error)) };
        const { userDataId } = parsed.data;
        if (!(await this.people.findById(userDataId))) return { error: new UserDataNotFoundError() };
        if (await this.repo.findByPerson(userDataId)) return { error: new PublicContactAlreadyExistsError() };
        // Entra no fim da lista.
        const contact = await this.repo.create({ userDataId,
title: parsed.data.title ?? null,
order: await this.repo.count() });
        return { contact };
    }
}

export class UpdatePublicContactUseCase {
    constructor(private readonly repo: PublicContactRepository) {}
    async execute(id: string, input: unknown): Promise<Result<{ contact?: PublicContactModel }>> {
        const parsed = updateSchema.safeParse(input);
        if (!parsed.success) return { error: new ValidationError(firstIssue(parsed.error)) };
        if (!(await this.repo.findById(id))) return { error: new PublicContactNotFoundError() };
        const contact = await this.repo.updateTitle(id, parsed.data.title ?? null);
        return { contact };
    }
}

export class RemovePublicContactUseCase {
    constructor(private readonly repo: PublicContactRepository) {}
    async execute(id: string): Promise<Result<object>> {
        if (!(await this.repo.findById(id))) return { error: new PublicContactNotFoundError() };
        await this.repo.delete(id);
        return {};
    }
}

export class ReorderPublicContactsUseCase {
    constructor(private readonly repo: PublicContactRepository) {}
    async execute(input: unknown): Promise<Result<object>> {
        const parsed = reorderSchema.safeParse(input);
        if (!parsed.success) return { error: new ValidationError(firstIssue(parsed.error)) };
        const ids = new Set((await this.repo.list()).map(c => c.id));
        const order = parsed.data.order;
        if (order.length !== ids.size || new Set(order).size !== order.length || !order.every(id => ids.has(id))) {
            return { error: new ValidationError('A ordem precisa conter todos os contatos, uma vez cada') };
        }
        await this.repo.reorder(order);
        return {};
    }
}
