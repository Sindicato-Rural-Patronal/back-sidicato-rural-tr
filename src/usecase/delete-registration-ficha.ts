import type { RegistrationRepository } from '../ports/external/registration-repository.js';
import { RegistrationNotFoundError } from '../errors/not-found.js';

export class DeleteRegistrationFichaUseCase {
    constructor(private readonly registrationRepository: RegistrationRepository) {}

    async execute(registrationId: string): Promise<{ error?: Error }> {
        const reg = await this.registrationRepository.findById(registrationId);
        if (!reg) return { error: new RegistrationNotFoundError() };
        await this.registrationRepository.deleteFicha(registrationId);
        return {};
    }
}
