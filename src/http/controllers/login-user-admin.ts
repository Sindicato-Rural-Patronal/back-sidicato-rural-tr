import { FastifyRequest, FastifyReply } from 'fastify';
import { LoginUserAdminUseCase } from '../../usecase/login-user-admin.js';

export class LoginUserAdminController {
    constructor(private loginUseCase: LoginUserAdminUseCase) {}

    async handle(request: FastifyRequest, reply: FastifyReply) {
        const { username, password } = request.body as { username: string; password: string };
        const response = await this.loginUseCase.execute(username, password);
        if (response.Error) {
            return reply.status(401).send({ error: response.Error.message });
        }
        return reply.status(200).send({ token: response.token });
    }
}
