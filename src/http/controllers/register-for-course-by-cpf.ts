import type { FastifyRequest, FastifyReply } from 'fastify';
import type { RegisterForCourseByCpfUseCase } from '../../usecase/register-for-course-by-cpf.js';
import { errorToStatus } from '../lib/require-permission.js';

type Body = { cpf: string };
type Params = { courseId: string };

export class RegisterForCourseByCpfController {
    constructor(private readonly useCase: RegisterForCourseByCpfUseCase) {}

    async handle(
        request: FastifyRequest<{
 Params: Params;
Body: Body 
}>,
        reply: FastifyReply,
    ) {
        const { courseId } = request.params;
        const { cpf } = request.body;
        const response = await this.useCase.execute({ courseId,
cpf });
        if (response.error) {
            return reply
                .status(errorToStatus(response.error))
                .send({ error: response.error.message });
        }
        return reply
            .status(201)
            .send({ registrationId: response.registrationId,
userDataId: response.userDataId });
    }
}
