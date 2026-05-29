import { FastifyRequest, FastifyReply } from "fastify";
import { ListCoursesUseCase } from "../../usecase/list-courses.js";

export class ListCoursesController {
    constructor(private readonly useCase: ListCoursesUseCase) {}

    async handle(_request: FastifyRequest, reply: FastifyReply) {
        const response = await this.useCase.execute();
        return reply.status(200).send(response.courses);
    }
}
