import { verifyPermission } from '../lib/verify-permission.js';
import { UserAdminRepository } from '../ports/external/user-admin-repository.js';
import { RuleRepository } from '../ports/external/rule-repository.js';
import { RegistrationRepository, RegistrationWithUserData } from '../ports/external/registration-repository.js';

type Request = { token: string; courseId: string };
type Response = { success: boolean; statusCode?: number; error?: Error; registrations?: RegistrationWithUserData[] };

export class ListCourseRegistrationsUseCase {
    constructor(
        private readonly registrationRepository: RegistrationRepository,
        private readonly userAdminRepository: UserAdminRepository,
        private readonly ruleRepository: RuleRepository,
    ) {}

    async execute(request: Request): Promise<Response> {
        const auth = await verifyPermission(
            request.token,
            'READ_COURSE',
            this.userAdminRepository,
            this.ruleRepository,
        );
        if (!auth.authorized) {
            return { success: false, statusCode: auth.statusCode, error: new Error(auth.error ?? 'Não autorizado') };
        }

        const registrations = await this.registrationRepository.findByCourseId(request.courseId);
        return { success: true, registrations };
    }
}
