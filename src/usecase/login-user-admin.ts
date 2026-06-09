import type { UserAdminRepository } from "../ports/external/user-admin-repository";
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';

type LoginUserAdminResponse = {
    token: string;
    Error?: Error;
}
export class LoginUserAdminUseCase {
    private readonly JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_change_me';

    constructor(
        private userAdminRepository: UserAdminRepository
    ) { }

    async execute(username: string, password: string): Promise<LoginUserAdminResponse> {
        console.log(`[LoginUserAdmin] attempt username="${username}"`);
        const user = await this.userAdminRepository.findByUsername(username);
        if (!user) {
            console.log(`[LoginUserAdmin] user not found: "${username}"`);
            return { token: '', Error: new Error('Invalid username or password') };
        }

        const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
        if (!isPasswordValid) {
            console.log(`[LoginUserAdmin] wrong password for username="${username}"`);
            return { token: '', Error: new Error('Invalid username or password') };
        }

        const token = jwt.sign(
            {
                userId: user.id,
                username: user.username,
                role: user.rulesId
            },
            this.JWT_SECRET,
            { expiresIn: '1h' }
        );

        console.log(`[LoginUserAdmin] success userId="${user.id}" rulesId="${user.rulesId}"`);
        return { token };
    }
}