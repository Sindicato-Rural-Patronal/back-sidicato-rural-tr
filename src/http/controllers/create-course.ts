import { FastifyRequest, FastifyReply } from 'fastify';
import { CreateCourseUseCase } from '../../usecase/create-course.js';

type CreateCourseBody = {
    name: string;
    description: string;
    roomId: string;
    startTime: string;
    endTime: string;
    status?: 'PUBLICO' | 'PRIVADO' | 'NAO_PUBLICADO';
    price?: number;
    workloadHours?: number;
    registrationDeadline?: string;
    observations?: string;
};

export class CreateCourseController {
    constructor(private createCourseUseCase: CreateCourseUseCase) {}

    async handle(request: FastifyRequest, reply: FastifyReply) {
        const body = request.body as CreateCourseBody;
        const response = await this.createCourseUseCase.execute({
            ...body,
            status: body.status ?? 'NAO_PUBLICADO',
            price: body.price ?? 0,
            workloadHours: body.workloadHours ?? 0,
        });
        if (!response.success) {
            return reply.status(400).send({ error: response.error?.message });
        }
        return reply.status(201).send({ id: response.courseId });
    }
}
