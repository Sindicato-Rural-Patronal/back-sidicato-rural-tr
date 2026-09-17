import type { CourseRepository, CourseWithDetails } from '../ports/external/course-repository.js';
import type { InstructorRepository } from '../ports/external/instructor-repository.js';
import type { DownloadedImage } from '../lib/download-image.js';

/** O que o curso novo copia de outro ao ser criado como cópia ("Duplicar curso"). */
export type CopyCourseExtrasRequest = {
    /** Curso recém-criado. */
    courseId: string;
    /** Copia a capa deste curso (arquivo próprio no storage, não a mesma URL). */
    coverFromCourseId?: string;
    /** Copia os instrutores (com título e categoria) deste curso. */
    instructorsFromCourseId?: string;
    /** Só estes vínculos (ids de CourseInstructor do curso de origem); ausente = todos. */
    instructorAssignmentIds?: string[];
};

export type CopyCourseExtrasResult = {
    /** Só vem quando a capa foi pedida: false = não deu para copiar (enviar pela edição). */
    coverCopied?: boolean;
    /** Só vem quando os instrutores foram pedidos. */
    instructorsCopied?: number;
};

/** O mesmo envio de capa do painel (`UploadCourseBannerUseCase`). */
interface BannerUploader {
    execute(courseId: string, fileBuffer: Buffer, mimeType: string): Promise<{ error?: Error }>;
}

/**
 * Cópias feitas depois de criar um curso duplicado. É "melhor esforço": se algo
 * falhar, o curso continua criado e a resposta diz o que não foi copiado.
 *
 * A capa não reaproveita a URL do curso de origem: o arquivo fica em
 * `courses/<id>/banner.jpg` e trocar a capa de um curso sobrescreve esse
 * arquivo, o que mudaria a capa do outro. Por isso a imagem é baixada e enviada
 * de novo pelo mesmo caminho do upload de capa, gerando o arquivo do curso novo.
 * A galeria não é copiada.
 */
export class CopyCourseExtrasUseCase {
    constructor(
        private readonly courseRepository: CourseRepository,
        private readonly instructorRepository: InstructorRepository,
        private readonly uploadBanner: BannerUploader,
        private readonly downloadImage: (url: string) => Promise<DownloadedImage | null>,
    ) {}

    async execute(request: CopyCourseExtrasRequest): Promise<CopyCourseExtrasResult> {
        const result: CopyCourseExtrasResult = {};
        const sources = new Map<string, CourseWithDetails | null>();
        const source = async (id: string) => {
            if (!sources.has(id)) sources.set(id, await this.courseRepository.findById(id));
            return sources.get(id) ?? null;
        };

        if (request.coverFromCourseId) {
            result.coverCopied = await this.copyCover(request.courseId, await source(request.coverFromCourseId));
        }

        if (request.instructorsFromCourseId) {
            const from = await source(request.instructorsFromCourseId);
            const wanted = request.instructorAssignmentIds ? new Set(request.instructorAssignmentIds) : null;
            let copied = 0;
            for (const assignment of from?.instructors ?? []) {
                if (wanted && !wanted.has(assignment.id)) continue;
                try {
                    await this.instructorRepository.addToCourse(
                        assignment.instructor.id,
                        request.courseId,
                        assignment.title ?? undefined,
                        assignment.category ?? undefined,
                    );
                    copied++;
                } catch {
                    // Instrutor removido nesse meio tempo etc.: segue com os demais.
                }
            }
            result.instructorsCopied = copied;
        }

        return result;
    }

    private async copyCover(courseId: string, from: CourseWithDetails | null): Promise<boolean> {
        if (!from?.bannerUrl) return false;
        try {
            const image = await this.downloadImage(from.bannerUrl);
            if (!image) return false;
            const uploaded = await this.uploadBanner.execute(courseId, image.data, image.mimeType);
            return !uploaded.error;
        } catch {
            return false;
        }
    }
}
