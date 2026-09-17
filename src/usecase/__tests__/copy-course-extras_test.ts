import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CopyCourseExtrasUseCase } from '../copy-course-extras.js';
import type { CourseRepository } from '../../ports/external/course-repository.js';
import type { InstructorRepository } from '../../ports/external/instructor-repository.js';

const courseRepo = { findById: vi.fn() } as unknown as CourseRepository;
const instructorRepo = { addToCourse: vi.fn() } as unknown as InstructorRepository;
const uploadBanner = { execute: vi.fn() };
const download = vi.fn();

const source = {
    id: 'old',
    bannerUrl: 'https://storage.example.com/course-banners/courses/old/banner.jpg?t=1',
    instructors: [
        { id: 'a1',
title: 'ENGENHEIRO AGRONOMO',
category: null,
instructor: { id: 'ins-1' } },
        { id: 'a2',
title: null,
category: 'PALESTRANTE',
instructor: { id: 'ins-2' } },
    ],
};

function uc() {
    return new CopyCourseExtrasUseCase(courseRepo, instructorRepo, uploadBanner, download);
}

describe('CopyCourseExtrasUseCase', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(courseRepo.findById).mockResolvedValue(source as never);
        vi.mocked(instructorRepo.addToCourse).mockResolvedValue({ id: 'new-assignment' } as never);
        download.mockResolvedValue({ data: Buffer.from('jpg'),
mimeType: 'image/jpeg' });
        uploadBanner.execute.mockResolvedValue({ url: 'https://storage.example.com/new.jpg' });
    });

    it('sem nada pedido não copia nada', async () => {
        expect(await uc().execute({ courseId: 'new' })).toEqual({});
        expect(courseRepo.findById).not.toHaveBeenCalled();
    });

    it('copia a capa enviando a imagem de novo para o curso novo (arquivo próprio)', async () => {
        const result = await uc().execute({ courseId: 'new',
coverFromCourseId: 'old' });
        expect(result).toEqual({ coverCopied: true });
        expect(download).toHaveBeenCalledWith(source.bannerUrl);
        expect(uploadBanner.execute).toHaveBeenCalledWith('new', Buffer.from('jpg'), 'image/jpeg');
    });

    it('curso de origem sem capa → coverCopied false', async () => {
        vi.mocked(courseRepo.findById).mockResolvedValue({ ...source,
bannerUrl: null } as never);
        const result = await uc().execute({ courseId: 'new',
coverFromCourseId: 'old' });
        expect(result.coverCopied).toBe(false);
        expect(download).not.toHaveBeenCalled();
    });

    it('falha ao baixar ou enviar a capa → coverCopied false, sem lançar', async () => {
        download.mockResolvedValueOnce(null);
        expect((await uc().execute({ courseId: 'new',
coverFromCourseId: 'old' })).coverCopied).toBe(false);

        uploadBanner.execute.mockResolvedValueOnce({ error: new Error('Formato não aceito') });
        expect((await uc().execute({ courseId: 'new',
coverFromCourseId: 'old' })).coverCopied).toBe(false);

        download.mockRejectedValueOnce(new Error('rede'));
        expect((await uc().execute({ courseId: 'new',
coverFromCourseId: 'old' })).coverCopied).toBe(false);
    });

    it('copia todos os instrutores com título e categoria', async () => {
        const result = await uc().execute({ courseId: 'new',
instructorsFromCourseId: 'old' });
        expect(result).toEqual({ instructorsCopied: 2 });
        expect(instructorRepo.addToCourse).toHaveBeenCalledWith('ins-1', 'new', 'ENGENHEIRO AGRONOMO', undefined);
        expect(instructorRepo.addToCourse).toHaveBeenCalledWith('ins-2', 'new', undefined, 'PALESTRANTE');
    });

    it('instructorAssignmentIds limita os instrutores copiados', async () => {
        const result = await uc().execute({
            courseId: 'new',
            instructorsFromCourseId: 'old',
            instructorAssignmentIds: ['a2'],
        });
        expect(result.instructorsCopied).toBe(1);
        expect(instructorRepo.addToCourse).toHaveBeenCalledTimes(1);
        expect(instructorRepo.addToCourse).toHaveBeenCalledWith('ins-2', 'new', undefined, 'PALESTRANTE');
    });

    it('um instrutor que falha não impede os outros', async () => {
        vi.mocked(instructorRepo.addToCourse).mockRejectedValueOnce(new Error('P2003'));
        const result = await uc().execute({ courseId: 'new',
instructorsFromCourseId: 'old' });
        expect(result.instructorsCopied).toBe(1);
    });

    it('capa e instrutores do mesmo curso buscam a origem uma vez só', async () => {
        const result = await uc().execute({
            courseId: 'new',
            coverFromCourseId: 'old',
            instructorsFromCourseId: 'old',
        });
        expect(result).toEqual({ coverCopied: true,
instructorsCopied: 2 });
        expect(courseRepo.findById).toHaveBeenCalledTimes(1);
    });

    it('curso de origem inexistente → nada copiado', async () => {
        vi.mocked(courseRepo.findById).mockResolvedValue(null);
        const result = await uc().execute({
            courseId: 'new',
            coverFromCourseId: 'x',
            instructorsFromCourseId: 'x',
        });
        expect(result).toEqual({ coverCopied: false,
instructorsCopied: 0 });
    });
});
