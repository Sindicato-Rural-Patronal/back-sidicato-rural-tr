// Limite de tentativas erradas por CPF nas rotas públicas que conferem o
// telefone (SR-025). O limite por IP (public-rate-limit.ts) não basta: quem
// troca de IP testaria as 10.000 combinações de 4 dígitos para um CPF em
// poucas horas. Com 5 erros por hora, no mesmo CPF, levaria meses.
//
// Conta erro para CPF sem cadastro também, senão o bloqueio (429) só
// apareceria para quem tem cadastro e diria que o CPF existe.
//
// Fica na memória do processo: a API roda numa instância só, e reiniciar
// zera os contadores, o que só devolve as tentativas de uma hora.

export const CPF_MAX_FAILURES = 5;
export const CPF_FAILURE_WINDOW_MS = 60 * 60 * 1000;
/** Teto de CPFs acompanhados, para a memória não crescer sem fim. */
const MAX_TRACKED = 50_000;

export class CpfAttemptLimiter {
    private readonly failures = new Map<string, number[]>();

    constructor(
        private readonly max = CPF_MAX_FAILURES,
        private readonly windowMs = CPF_FAILURE_WINDOW_MS,
        private readonly now: () => number = Date.now,
    ) {}

    /** Já errou o máximo na última hora: nem confere. */
    isBlocked(cpf: string): boolean {
        return this.recent(key(cpf)).length >= this.max;
    }

    recordFailure(cpf: string): void {
        const k = key(cpf);
        const list = this.recent(k);
        list.push(this.now());
        this.failures.delete(k); // reinsere no fim: a ordem do Map é a do último erro
        this.failures.set(k, list);
        if (this.failures.size > MAX_TRACKED) this.prune();
    }

    private recent(k: string): number[] {
        const since = this.now() - this.windowMs;
        const list = (this.failures.get(k) ?? []).filter(t => t > since);
        if (list.length === 0) this.failures.delete(k);
        return list;
    }

    private prune(): void {
        const since = this.now() - this.windowMs;
        for (const [k, list] of this.failures) {
            if (list[list.length - 1] <= since) this.failures.delete(k);
        }
        // Ainda cheio: sai quem errou há mais tempo.
        for (const k of this.failures.keys()) {
            if (this.failures.size <= MAX_TRACKED) break;
            this.failures.delete(k);
        }
    }
}

const key = (cpf: string) => cpf.replace(/\D/g, '');
