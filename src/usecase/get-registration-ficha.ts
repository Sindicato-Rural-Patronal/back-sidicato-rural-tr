import type {
    RegistrationRepository,
    RegistrationFichaFile,
} from '../ports/external/registration-repository.js';

export class GetRegistrationFichaUseCase {
    constructor(private readonly registrationRepository: RegistrationRepository) {}

    execute(registrationId: string): Promise<RegistrationFichaFile | null> {
        return this.registrationRepository.getFicha(registrationId);
    }
}
