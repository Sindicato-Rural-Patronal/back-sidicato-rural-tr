import type { UserDataRepository } from '../ports/external/user-data-repository.js';
import { isValidCpf } from '../lib/cpf.js';
import { parsePhoneEnd, phoneEndMatches } from '../lib/phone-match.js';
import type { CpfAttemptLimiter } from '../lib/cpf-attempt-limiter.js';
import { ValidationError } from '../errors/validation.js';
import { TooManyAttemptsError } from '../errors/too-many-attempts.js';

/** Mascara o nome: primeiro nome inteiro, demais como iniciais. "João Silva" -> "João S." */
function maskName(name: string): string {
    const parts = name.trim().split(/\s+/);
    if (parts.length <= 1) return parts[0] ?? '';
    return parts[0] + ' ' + parts.slice(1).map(p => (p[0] ? p[0].toUpperCase() + '.' : '')).join(' ');
}

type LookupResponse = {
    error?: Error;
    found?: boolean;
    name?: string | null;
};

const NOT_FOUND = { found: false,
name: null };

/**
 * Consulta pública por CPF + 4 últimos dígitos do telefone: diz se o par bate
 * com um cadastro e devolve o nome mascarado para o inscrito confirmar "é você?".
 * Não registra nada.
 *
 * CPF sem cadastro e telefone que não confere dão a mesma resposta (SR-025):
 * filiação a sindicato é dado sensível (LGPD), e só o CPF não pode revelar quem
 * é associado. Os dois casos fazem a mesma consulta ao banco e contam como erro
 * no limite por CPF.
 */
export class LookupUserByCpfUseCase {
    constructor(
        private readonly userDataRepository: UserDataRepository,
        private readonly attempts: CpfAttemptLimiter,
    ) {}

    async execute(input: {
 cpf: string;
phoneEnd: string 
}): Promise<LookupResponse> {
        const phoneEnd = parsePhoneEnd(input.phoneEnd);
        if (!phoneEnd) return { error: new ValidationError('Informe os 4 últimos dígitos do telefone.') };
        if (!isValidCpf(input.cpf)) return NOT_FOUND;
        if (this.attempts.isBlocked(input.cpf)) return { error: new TooManyAttemptsError() };

        const user = await this.userDataRepository.findByCpf(input.cpf);
        if (!user || !phoneEndMatches(user, phoneEnd)) {
            this.attempts.recordFailure(input.cpf);
            return NOT_FOUND;
        }
        return { found: true,
name: maskName(user.name) };
    }
}
