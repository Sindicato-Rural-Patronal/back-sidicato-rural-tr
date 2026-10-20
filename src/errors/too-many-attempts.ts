// Tentativas demais para o mesmo CPF nas rotas públicas (lib/cpf-attempt-limiter.ts).
// errorToStatus → 429; lançado, o apiErrorHandler também responde 429 pelo statusCode.
export class TooManyAttemptsError extends Error {
    readonly statusCode = 429;

    constructor() {
        super('Muitas tentativas com este CPF. Aguarde uma hora ou procure o Sindicato.');
        this.name = 'TooManyAttemptsError';
    }
}
