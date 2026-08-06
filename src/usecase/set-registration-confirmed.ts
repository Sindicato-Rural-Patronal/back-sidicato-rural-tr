import type { RegistrationRepository } from '../ports/external/registration-repository.js';
import { RegistrationNotFoundError } from '../errors/not-found.js';

export class SetRegistrationConfirmedUseCase {
    constructor(private readonly registrationRepository: RegistrationRepository) {}

    async execute(id: string, confirmed: boolean): Promise<{ error?: Error }> {
        const reg = await this.registrationRepository.findById(id);
        if (!reg) return { error: new RegistrationNotFoundError() };
        await this.registrationRepository.setConfirmed(id, confirmed);
        return {};
    }
}
