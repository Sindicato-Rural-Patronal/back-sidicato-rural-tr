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
        console.log(`[LoginUserAdmin] attempt username="${username}"`);
        const user = await this.userAdminRepository.findByUsername(username);
        if (!user) {
            console.log(`[LoginUserAdmin] user not found: "${username}"`);
            return { error: new InvalidCredentialsError() };
        }

        const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
        if (!isPasswordValid) {
            console.log(`[LoginUserAdmin] wrong password for username="${username}"`);
            return { error: new InvalidCredentialsError() };
        }

        const token = jwt.sign(
            { userId: user.id,
username: user.username,
role: user.rulesId },
            this.JWT_SECRET,
            { expiresIn: '1h' },
        );

        console.log(`[LoginUserAdmin] success userId="${user.id}" rulesId="${user.rulesId}"`);
        return { token };
    }
}
