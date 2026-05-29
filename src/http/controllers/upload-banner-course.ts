import type { FastifyRequest, FastifyReply } from 'fastify';
import type { UploadCourseBannerUseCase } from '../../usecase/upload-banner-course.js';

export class UploadBannerCourseController {
    constructor(private uploadBannerUseCase: UploadCourseBannerUseCase) {}

    async handle(request: FastifyRequest<{ Params: { courseId: string } }>, reply: FastifyReply) {
        const { courseId } = request.params;
        const data = await request.file();
        if (!data) {
            return reply.status(400).send({ error: 'No file uploaded' });
        }
        const chunks: Buffer[] = [];
        for await (const chunk of data.file) {
            chunks.push(chunk);
        }
        const fileBuffer = Buffer.concat(chunks);
        try {
            const url = await this.uploadBannerUseCase.execute(courseId, fileBuffer);
            return reply.status(200).send({ url });
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            return reply.status(500).send({ error: msg });
        }
    }
}
