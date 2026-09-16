import type {
    ConvenioRepository,
    ConvenioModel,
    ConvenioMenuItem,
} from '../ports/external/convenio-repository.js';
import { ValidationError } from '../errors/validation.js';
import { ConvenioNotFoundError } from '../errors/not-found.js';
import { ConvenioSlugAlreadyExistsError } from '../errors/conflict.js';
import { convenioSchema, convenioUpdateSchema, firstIssue } from './convenio-schema.js';

// Casos de uso do módulo de Convênios num arquivo só: são finos e compartilham
// o mesmo repositório e as mesmas regras de slug.

/** Menu público "Convênios": só os ativos. */
export class ListConvenioMenuUseCase {
    constructor(private readonly repo: ConvenioRepository) {}
    execute(): Promise<ConvenioMenuItem[]> {
        return this.repo.listMenu();
    }
}

/** Admin: todos, inclusive inativos. */
export class ListConveniosUseCase {
    constructor(private readonly repo: ConvenioRepository) {}
    execute(): Promise<ConvenioModel[]> {
        return this.repo.findAll();
    }
}

/** Página pública: convênio inativo responde como inexistente. */
export class GetPublicConvenioUseCase {
    constructor(private readonly repo: ConvenioRepository) {}
    async execute(slug: string): Promise<{
 error?: Error;
convenio?: ConvenioModel 
}> {
        const convenio = await this.repo.findBySlug(slug.trim().toLowerCase());
        if (!convenio || !convenio.isActive) return { error: new ConvenioNotFoundError() };
        return { convenio };
    }
}

export class GetConvenioUseCase {
    constructor(private readonly repo: ConvenioRepository) {}
    async execute(id: string): Promise<{
 error?: Error;
convenio?: ConvenioModel 
}> {
        const convenio = await this.repo.findById(id);
        if (!convenio) return { error: new ConvenioNotFoundError() };
        return { convenio };
    }
}

export class CreateConvenioUseCase {
    constructor(private readonly repo: ConvenioRepository) {}
    async execute(input: unknown): Promise<{
 error?: Error;
convenio?: ConvenioModel 
}> {
        const parsed = convenioSchema.safeParse(input);
        if (!parsed.success) return { error: new ValidationError(firstIssue(parsed.error)) };

        if (await this.repo.findBySlug(parsed.data.slug)) {
            return { error: new ConvenioSlugAlreadyExistsError() };
        }
        const convenio = await this.repo.create(parsed.data);
        return { convenio };
    }
}

export class UpdateConvenioUseCase {
    constructor(private readonly repo: ConvenioRepository) {}
    async execute(id: string, input: unknown): Promise<{
 error?: Error;
convenio?: ConvenioModel 
}> {
        const parsed = convenioUpdateSchema.safeParse(input);
        if (!parsed.success) return { error: new ValidationError(firstIssue(parsed.error)) };

        const existing = await this.repo.findById(id);
        if (!existing) return { error: new ConvenioNotFoundError() };

        const { slug } = parsed.data;
        if (slug !== undefined && slug !== existing.slug) {
            const other = await this.repo.findBySlug(slug);
            if (other && other.id !== id) return { error: new ConvenioSlugAlreadyExistsError() };
        }
        const convenio = await this.repo.update(id, parsed.data);
        return { convenio };
    }
}

export class DeleteConvenioUseCase {
    constructor(private readonly repo: ConvenioRepository) {}
    async execute(id: string): Promise<{ error?: Error }> {
        const existing = await this.repo.findById(id);
        if (!existing) return { error: new ConvenioNotFoundError() };
        await this.repo.delete(id);
        return {};
    }
}
