import type { RegistrationRepository } from '../ports/external/registration-repository.js';
import { RegistrationNotFoundError } from '../errors/not-found.js';

type Response = { error?: Error };

export class CancelRegistrationUseCase {
    constructor(private readonly registrationRepository: RegistrationRepository) {}

    async execute(registrationId: string): Promise<Response> {
        const registration = await this.registrationRepository.findById(registrationId);
        if (!registration) {
            return { error: new RegistrationNotFoundError() };
        }

        const deleted = await this.registrationRepository.delete(registrationId);
        if (!deleted) {
            return { error: new Error('Failed to cancel registration') };
        }

        return {};
    }
}
