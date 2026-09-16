import sharp from 'sharp';
import type { StorageRepository } from '../ports/external/storage-repository.js';
import type { CompanyRepository } from '../ports/external/company-repository.js';
import { CompanyNotFoundError } from '../errors/not-found.js';
import { ValidationError } from '../errors/validation.js';
import { buckets } from '../lib/buckets.js';

// Mesmo tratamento do logo de parceiro de antes (quando parceiro era pessoa):
// 300×150 sem cortar, fundo transparente, PNG — só que agora na empresa.
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024;
const WIDTH = 300;
const HEIGHT = 150;

export class UploadCompanyPartnerLogoUseCase {
    constructor(
        private readonly storage: StorageRepository,
        private readonly repo: CompanyRepository,
    ) {}

    async execute(companyId: string, file: Buffer, mimeType: string): Promise<{
 error?: Error;
partnerLogoUrl?: string 
}> {
        if (!ALLOWED_TYPES.includes(mimeType)) {
            return { error: new ValidationError('Tipo de arquivo inválido. Use PNG, JPG ou WebP.') };
        }
        if (file.length === 0) return { error: new ValidationError('Arquivo vazio.') };
        if (file.length > MAX_BYTES) return { error: new ValidationError('Arquivo muito grande. Máximo 5MB.') };

        const company = await this.repo.findById(companyId);
        if (!company) return { error: new CompanyNotFoundError() };

        const processed = await sharp(file)
            .resize(WIDTH, HEIGHT, { fit: 'contain',
background: { r: 0,
g: 0,
b: 0,
alpha: 0 } })
            .png({ compressionLevel: 8 })
            .toBuffer();

        const bucket = buckets.avatars;
        const key = `partner-logos/companies/${companyId}/logo.png`;
        await this.storage.uploadFile({ bucket,
key,
body: processed,
contentType: 'image/png' });

        const partnerLogoUrl = `${this.storage.getPublicUrl(bucket, key)}?t=${Date.now()}`;
        await this.repo.update(companyId, { partnerLogo: partnerLogoUrl });
        return { partnerLogoUrl };
    }
}
