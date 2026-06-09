import { verifyPermission } from '../lib/verify-permission.js';
import type { UserAdminRepository } from '../ports/external/user-admin-repository.js';
import type { RuleRepository } from '../ports/external/rule-repository.js';
import type { RegistrationRepository, RegistrationWithUserData } from '../ports/external/registration-repository.js';

type Request = { token: string; courseId: string };
type Response = { success: boolean; statusCode?: number; error?: Error; registrations?: RegistrationWithUserData[] };

export class ListCourseRegistrationsUseCase {
    constructor(
        private readonly registrationRepository: RegistrationRepository,
        private readonly userAdminRepository: UserAdminRepository,
        private readonly ruleRepository: RuleRepository,
    ) {}

    async execute(request: Request): Promise<Response> {
        console.log(`[ListCourseRegistrations] courseId="${request.courseId}"`);
        const auth = await verifyPermission(
            request.token,
            'READ_COURSE',
            this.userAdminRepository,
            this.ruleRepository,
        );
        if (!auth.authorized) {
            console.log(`[ListCourseRegistrations] denied: ${auth.error}`);
            return { success: false, statusCode: auth.statusCode, error: new Error(auth.error ?? 'Não autorizado') };
        }

        const registrations = await this.registrationRepository.findByCourseId(request.courseId);
        console.log(`[ListCourseRegistrations] returning ${registrations.length} registrations`);
        return { success: true, registrations };
    }
}
