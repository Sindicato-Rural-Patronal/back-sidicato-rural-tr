import type {
    MarketQuoteRepository,
    MarketQuoteUpdateInput,
} from '../ports/external/market-quote-repository.js';
import { ValidationError } from '../errors/validation.js';
import { MarketQuoteNotFoundError } from '../errors/not-found.js';
import { marketQuoteSchema } from './create-market-quote.js';
import { parseQuoteNumber, formatVariation } from '../lib/quote-number.js';

const updateSchema = marketQuoteSchema.partial();

export class UpdateMarketQuoteUseCase {
    constructor(private readonly repo: MarketQuoteRepository) {}

    async execute(id: string, input: unknown): Promise<{ error?: Error }> {
        const parsed = updateSchema.safeParse(input);
        if (!parsed.success) {
            return { error: new ValidationError(parsed.error.issues[0]?.message ?? 'Dados inválidos') };
        }
        const existing = await this.repo.findById(id);
        if (!existing) return { error: new MarketQuoteNotFoundError() };

        const data: MarketQuoteUpdateInput = { ...parsed.data };

        // Novo valor → calcula a variação automaticamente vs o último e registra
        // no histórico. Edição sem mudar o valor não mexe na variação/histórico.
        const valueChanged = parsed.data.value !== undefined && parsed.data.value !== existing.value;
        if (valueChanged) {
            const newNumeric = parseQuoteNumber(parsed.data.value);
            const prevNumeric = await this.repo.getLastNumeric(id);
            data.variation = formatVariation(prevNumeric, newNumeric);
            await this.repo.update(id, data);
            await this.repo.addHistory(id, parsed.data.value!, newNumeric);
        } else {
            await this.repo.update(id, data);
        }
        return {};
    }
}
