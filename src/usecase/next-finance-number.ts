import type { FinanceRepository } from '../ports/external/finance-repository.js';

/**
 * O próximo Nº automático (o maior + 1, contando os excluídos; decisão 005).
 * Só informativo, para o formulário mostrar "Automático (próximo: 128)" e
 * avisar quando o digitado pula a sequência: não reserva o número.
 */
export class NextFinanceNumberUseCase {
    constructor(private readonly repo: FinanceRepository) {}

    async execute(): Promise<{ next: number }> {
        return { next: await this.repo.nextTransactionNumber() };
    }
}
