import type { UserAdminRepository } from '../ports/external/user-admin-repository.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { InvalidCredentialsError } from '../errors/auth.js';

type LoginUserAdminResponse = {
    error?: Error;
    token?: string;
};

// Hash bcrypt fixo (custo 10) usado só para igualar o tempo de resposta quando
// o usuário não existe — evita enumeração de usuários por timing.
const DUMMY_HASH = '$2b$10$E9d/2nTuBlwxYEej3M.iSudyF/Cim18xdoCHh6GGC8NYRGFL8Bs2C';

export class LoginUserAdminUseCase {
    private readonly JWT_SECRET = process.env.JWT_SECRET!;

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

        const token = jwt.sign(
            { userId: user.id,
username: user.username,
role: user.rulesId },
            this.JWT_SECRET,
            { expiresIn: '1h' },
        );

        return { token };
    }
}
