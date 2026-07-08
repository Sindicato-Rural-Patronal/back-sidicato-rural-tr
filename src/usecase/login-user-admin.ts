import type { UserAdminRepository } from '../ports/external/user-admin-repository.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { InvalidCredentialsError } from '../errors/auth.js';

type LoginUserAdminResponse = {
    error?: Error;
    token?: string;
};

export class LoginUserAdminUseCase {
    private readonly JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_change_me';

    constructor(private userAdminRepository: UserAdminRepository) {}

    async execute(username: string, password: string): Promise<LoginUserAdminResponse> {
        const user = await this.userAdminRepository.findByUsername(username);
        if (!user) {
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
