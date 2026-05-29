import { verifyPermission } from '../lib/verify-permission.js';
import type { UserAdminRepository } from '../ports/external/user-admin-repository.js';
import type { RuleRepository } from '../ports/external/rule-repository.js';
import type { RegistrationRepository } from '../ports/external/registration-repository.js';

type Request = { token: string; registrationId: string };
type Response = { success: boolean; statusCode?: number; error?: Error };

export class CancelRegistrationUseCase {
    constructor(
        private readonly registrationRepository: RegistrationRepository,
        private readonly userAdminRepository: UserAdminRepository,
        private readonly ruleRepository: RuleRepository,
    ) {}

    async execute(request: Request): Promise<Response> {
        const auth = await verifyPermission(
            request.token,
            'UPDATE_COURSE',
            this.userAdminRepository,
            this.ruleRepository,
        );
        if (!auth.authorized) {
            return { success: false, statusCode: auth.statusCode, error: new Error(auth.error ?? 'Unauthorized') };
        }

        const registration = await this.registrationRepository.findById(request.registrationId);
        if (!registration) {
            return { success: false, error: new Error('Registration not found') };
        }

        const deleted = await this.registrationRepository.delete(request.registrationId);
        if (!deleted) {
            return { success: false, error: new Error('Failed to cancel registration') };
        }

        return { success: true };
    }
}
