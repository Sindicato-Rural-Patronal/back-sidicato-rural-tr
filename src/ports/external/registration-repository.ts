import type { courseUserRegistrationModel } from '../../generated/prisma/models/courseUserRegistration.js';
import type { UserDataModel } from '../../generated/prisma/models/UserData.js';

export type RegistrationWithUserData = courseUserRegistrationModel & {
    userData: Pick<
        UserDataModel,
        'id' | 'name' | 'email' | 'phone' | 'cpf' | 'cnpj' | 'avatar' | 'birthDate' | 'isPartner' | 'boardMember' | 'boardPosition'
    > & {
userAdmin: {
 publicTitle: string | null;
isPublic: boolean
} | null;
};
    ficha: { id: string; filename: string; createdAt: Date } | null;
};

export type RegistrationFichaFile = { data: Buffer; filename: string; mimeType: string };

export interface RegistrationRepository {
    create(courseId: string, userDataId: string): Promise<courseUserRegistrationModel>;
    findById(id: string): Promise<RegistrationWithUserData | null>;
    findByCourseId(courseId: string, skip?: number, take?: number): Promise<RegistrationWithUserData[]>;
    countByCourseId(courseId: string): Promise<number>;
    findByUserDataAndCourse(
        userDataId: string,
        courseId: string,
    ): Promise<courseUserRegistrationModel | null>;
    count(filter?: { since?: Date }): Promise<number>;
    setConfirmed(id: string, confirmed: boolean): Promise<courseUserRegistrationModel | null>;
    countUnconfirmed(courseId: string): Promise<number>;
    delete(id: string): Promise<boolean>;
    setFicha(registrationId: string, data: Buffer, filename: string, mimeType: string): Promise<void>;
    getFicha(registrationId: string): Promise<RegistrationFichaFile | null>;
    deleteFicha(registrationId: string): Promise<boolean>;
}
