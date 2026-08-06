import type { FastifyRequest, FastifyReply } from 'fastify';
import type { RegisterForCourseFullUseCase } from '../../usecase/register-for-course-full.js';
import { errorToStatus } from '../lib/require-permission.js';

type Body = {
    name: string;
    phone: string;
    email: string;
    cpf: string;
    rg?: string;
    birthDate?: string;
    address?: {
        type?: 'URBAN' | 'RURAL';
        zipCode?: string;
        street?: string;
        number?: string;
        neighborhood?: string;
        city?: string;
        state?: string;
        road?: string;
        km?: string;
    };
};
type Params = { courseId: string };

export class RegisterForCourseFullController {
    constructor(private readonly useCase: RegisterForCourseFullUseCase) {}

    async handle(request: FastifyRequest<{ Params: Params; Body: Body }>, reply: FastifyReply) {
        const { courseId } = request.params;
        const response = await this.useCase.execute({ courseId, ...request.body });
        if (response.error) {
            return reply.status(errorToStatus(response.error)).send({ error: response.error.message });
        }
        return reply
            .status(201)
            .send({ registrationId: response.registrationId, userDataId: response.userDataId });
    }
}
