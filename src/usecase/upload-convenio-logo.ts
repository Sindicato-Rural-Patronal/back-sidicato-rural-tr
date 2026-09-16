import sharp from 'sharp';
import { ConvenioNotFoundError } from '../errors/not-found.js';
import { ValidationError } from '../errors/validation.js';
import { validateImageUpload } from '../lib/image-upload.js';
import { buckets } from '../lib/buckets.js';
import type { ConvenioRepository } from '../ports/external/convenio-repository.js';
import type { StorageRepository } from '../ports/external/storage-repository.js';

// Mesmo bucket público dos banners da home, em pasta própria.
const LOGO_BUCKET = buckets.courseBanners;
const LOGO_MAX_WIDTH = 480;
const LOGO_MAX_HEIGHT = 240;

export class UploadConvenioLogoUseCase {
    constructor(
        private readonly repo: ConvenioRepository,
        private readonly storage: StorageRepository,
    ) {}

    async execute(id: string, fileBuffer: Buffer, mimeType: string): Promise<{
 error?: Error;
logoUrl?: string 
}> {
        const invalid = validateImageUpload(fileBuffer, mimeType);
        if (invalid) return { error: new ValidationError(invalid) };

        const convenio = await this.repo.findById(id);
        if (!convenio) return { error: new ConvenioNotFoundError() };

        // Logo: cabe numa caixa 480×240 sem cortar nem ampliar, em PNG pra manter
        // a transparência.
        const processed = await sharp(fileBuffer)
            .resize(LOGO_MAX_WIDTH, LOGO_MAX_HEIGHT, { fit: 'inside',
withoutEnlargement: true })
            .png()
            .toBuffer();

        const key = `convenios/${id}/logo.png`;
        await this.storage.uploadFile({ bucket: LOGO_BUCKET,
key,
body: processed,
contentType: 'image/png' });

        // `?t=` fura o cache do navegador quando o logo é trocado.
        const logoUrl = `${this.storage.getPublicUrl(LOGO_BUCKET, key)}?t=${Date.now()}`;
        await this.repo.update(id, { logoUrl });
        return { logoUrl };
    }
}
