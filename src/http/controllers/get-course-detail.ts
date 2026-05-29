import { FastifyRequest, FastifyReply } from "fastify";
import { GetCourseDetailUseCase } from "../../usecase/get-course-detail.js";

export class GetCourseDetailController {
    constructor(private readonly useCase: GetCourseDetailUseCase) {}

    async handle(request: FastifyRequest<{ Params: { courseId: string } }>, reply: FastifyReply) {
        const { courseId } = request.params;
        const response = await this.useCase.execute(courseId);
        if (!response.success) {
            return reply.status(404).send({ error: response.error?.message });
        }
        return reply.status(200).send(response.course);
    }
}
