import type { courseUserRegistrationModel } from '../../generated/prisma/models/courseUserRegistration.js';
import type { UserDataModel } from '../../generated/prisma/models/UserData.js';

export type RegistrationWithUserData = courseUserRegistrationModel & {
    userData: Pick<UserDataModel, 'id' | 'name' | 'email' | 'phone' | 'cpf' | 'cnpj' | 'avatar'>;
};

export interface RegistrationRepository {
    create(courseId: string, userDataId: string): Promise<courseUserRegistrationModel>;
    findById(id: string): Promise<RegistrationWithUserData | null>;
    findByCourseId(courseId: string): Promise<RegistrationWithUserData[]>;
    findByUserDataAndCourse(userDataId: string, courseId: string): Promise<courseUserRegistrationModel | null>;
    delete(id: string): Promise<boolean>;
}
