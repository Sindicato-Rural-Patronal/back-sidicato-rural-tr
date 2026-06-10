import type { FastifyRequest, FastifyReply } from 'fastify';
import type { RegisterForCourseUseCase } from '../../usecase/register-for-course.js';
import { errorToStatus } from '../lib/require-permission.js';

type Body = {
    name: string;
    phone: string;
    email: string;
    cpf: string;
};
type Params = { courseId: string };

export class RegisterForCourseController {
    constructor(private readonly useCase: RegisterForCourseUseCase) {}

    async handle(
        request: FastifyRequest<{
            Params: Params;
            Body: Body;
        }>,
        reply: FastifyReply,
    ) {
        const { courseId } = request.params;
        const body = request.body;
        const response = await this.useCase.execute({ courseId,
...body });
        if (response.error) {
            return reply
                .status(errorToStatus(response.error))
                .send({ error: response.error?.message });
        }
        return reply
            .status(201)
            .send({ registrationId: response.registrationId,
userDataId: response.userDataId });
    }
}
