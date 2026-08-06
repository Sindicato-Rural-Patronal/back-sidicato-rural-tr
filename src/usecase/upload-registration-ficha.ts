import type { RegistrationRepository } from '../ports/external/registration-repository.js';
import { RegistrationNotFoundError } from '../errors/not-found.js';

const MAX_BYTES = 15 * 1024 * 1024; // 15MB

export class UploadRegistrationFichaUseCase {
    constructor(private readonly registrationRepository: RegistrationRepository) {}

    async execute(
        registrationId: string,
        data: Buffer,
        filename: string,
        mimeType: string,
    ): Promise<{ error?: Error; filename?: string }> {
        const reg = await this.registrationRepository.findById(registrationId);
        if (!reg) return { error: new RegistrationNotFoundError() };
        if (mimeType !== 'application/pdf') {
            return { error: new Error('Apenas arquivos PDF são aceitos.') };
        }
        if (data.length === 0) return { error: new Error('Arquivo vazio.') };
        if (data.length > MAX_BYTES) {
            return { error: new Error('Arquivo excede o limite de 15MB.') };
        }
        await this.registrationRepository.setFicha(registrationId, data, filename, mimeType);
        return { filename };
    }
}
