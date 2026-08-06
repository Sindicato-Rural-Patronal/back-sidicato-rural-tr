import type { UserDataRepository } from '../ports/external/user-data-repository.js';
import { isValidCpf } from '../lib/cpf.js';

/** Mascara o nome: primeiro nome inteiro, demais como iniciais. "João Silva" -> "João S." */
function maskName(name: string): string {
    const parts = name.trim().split(/\s+/);
    if (parts.length <= 1) return parts[0] ?? '';
    return parts[0] + ' ' + parts.slice(1).map(p => (p[0] ? p[0].toUpperCase() + '.' : '')).join(' ');
}

type LookupResponse = {
 found: boolean;
name: string | null 
};

/**
 * Consulta pública por CPF: diz se já existe um cadastro e devolve o nome
 * mascarado para o inscrito confirmar "é você?". Não registra nada.
 */
export class LookupUserByCpfUseCase {
    constructor(private readonly userDataRepository: UserDataRepository) {}

    async execute(cpf: string): Promise<LookupResponse> {
        if (!isValidCpf(cpf)) return { found: false,
name: null };
        const user = await this.userDataRepository.findByCpf(cpf);
        if (!user) return { found: false,
name: null };
        return { found: true,
name: maskName(user.name) };
    }
}
