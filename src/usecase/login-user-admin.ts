import type { UserAdminRepository } from '../ports/external/user-admin-repository.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { InvalidCredentialsError } from '../errors/auth.js';

type LoginUserAdminResponse = {
    error?: Error;
    token?: string;
};

// Validade do token de admin. O painel renova sozinho enquanto está em uso
// (POST /auth/refresh), então só expira de fato após 8h sem atividade.
export const ADMIN_TOKEN_TTL = '8h';

// A renovação automática só vale até 24h depois do login (`authTime`): um token
// vazado não se renova para sempre e, no dia seguinte, é preciso entrar de novo.
export const ADMIN_SESSION_MAX_SECONDS = 24 * 60 * 60;

type AdminTokenSubject = {
    id: string;
    username: string;
    rulesId: string;
};

// Payload do JWT de admin — o mesmo no login e na renovação.
export function signAdminToken(admin: AdminTokenSubject, authTime = Math.floor(Date.now() / 1000)): string {
    const payload = {
        userId: admin.id,
        username: admin.username,
        role: admin.rulesId,
        // Momento do login (segundos); a renovação preserva.
        authTime,
    };
    return jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: ADMIN_TOKEN_TTL });
}

// Hash bcrypt fixo (custo 10) usado só para igualar o tempo de resposta quando
// o usuário não existe — evita enumeração de usuários por timing.
const DUMMY_HASH = '$2b$10$E9d/2nTuBlwxYEej3M.iSudyF/Cim18xdoCHh6GGC8NYRGFL8Bs2C';

export class LoginUserAdminUseCase {
    constructor(private userAdminRepository: UserAdminRepository) {}

    async execute(username: string, password: string): Promise<LoginUserAdminResponse> {
        const user = await this.userAdminRepository.findByUsername(username);
        if (!user) {
            // Compara contra hash dummy para equalizar o tempo; resultado ignorado.
            await bcrypt.compare(password, DUMMY_HASH);
            return { error: new InvalidCredentialsError() };
        }

        const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
        if (!isPasswordValid) {
            return { error: new InvalidCredentialsError() };
        }

        return { token: signAdminToken(user) };
    }
}
