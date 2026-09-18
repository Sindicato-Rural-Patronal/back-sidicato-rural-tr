import type { UnimedRepository, UnimedUpdateInput } from '../ports/external/unimed-repository.js';
import { ValidationError } from '../errors/validation.js';
import { UnimedBeneficiarioNotFoundError } from '../errors/not-found.js';
import { unimedSchema } from './create-unimed.js';
import { unimedFieldsIssue } from '../lib/unimed-options.js';

// Atualização parcial — não permite trocar o usuário vinculado.
const updateSchema = unimedSchema.partial().omit({ userDataId: true });

export class UpdateUnimedUseCase {
    constructor(private readonly repo: UnimedRepository) {}

    async execute(id: string, input: unknown): Promise<{ error?: Error }> {
        const parsed = updateSchema.safeParse(input);
        if (!parsed.success) {
            return { error: new ValidationError(parsed.error.issues[0]?.message ?? 'Dados inválidos') };
        }
        const existing = await this.repo.findById(id);
        if (!existing) return { error: new UnimedBeneficiarioNotFoundError() };

        // Listas fixas e CNS — o valor antigo do próprio registro continua aceito,
        // para não travar (nem perder) cadastros vindos do sistema legado.
        const issue = unimedFieldsIssue(parsed.data, existing);
        if (issue) return { error: new ValidationError(issue) };

        await this.repo.update(id, parsed.data as UnimedUpdateInput);
        return {};
    }
}
