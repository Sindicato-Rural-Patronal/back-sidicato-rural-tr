import type { courseUserRegistrationModel } from '../../generated/prisma/models/courseUserRegistration.js';
import type { UserDataModel } from '../../generated/prisma/models/UserData.js';

export type RegistrationWithUserData = courseUserRegistrationModel & {
    userData: Pick<
        UserDataModel,
        | 'id'
        | 'name'
        | 'email'
        | 'phone'
        | 'cpf'
        | 'avatar'
        | 'birthDate'
        | 'boardMember'
        | 'boardPosition'
        | 'memberStatus'
        | 'membershipValidUntil'
    > & {
        /** Cargo em "Nossa Equipe", se a pessoa for contato público. */
        publicContact: { title: string | null } | null;
        /** Só vínculos com empresas parceiras ativas (selo na lista de inscritos). */
        companyMemberships: {
 company: {
 name: string;
tradeName: string | null 
} 
}[];
    };
    ficha: {
 id: string;
filename: string;
createdAt: Date 
} | null;
};

export type RegistrationFichaFile = {
 data: Buffer;
filename: string;
mimeType: string 
};

export interface RegistrationRepository {
    create(courseId: string, userDataId: string): Promise<courseUserRegistrationModel>;
    /**
     * Cria a inscrição de forma atômica respeitando a capacidade: conta as
     * inscrições ativas e insere na mesma transação serializável. Retorna
     * 'FULL' se a sala já estiver cheia (evita a corrida TOCTOU do pré-check).
     */
    createWithCapacity(
        courseId: string,
        userDataId: string,
        maxCapacity: number,
        options?: { confirmed?: boolean },
    ): Promise<courseUserRegistrationModel | 'FULL'>;
    findById(id: string): Promise<RegistrationWithUserData | null>;
    findByCourseId(courseId: string, skip?: number, take?: number): Promise<RegistrationWithUserData[]>;
    countByCourseId(courseId: string): Promise<number>;
    findByUserDataAndCourse(
        userDataId: string,
        courseId: string,
    ): Promise<courseUserRegistrationModel | null>;
    count(filter?: { since?: Date }): Promise<number>;
    setConfirmed(id: string, confirmed: boolean): Promise<courseUserRegistrationModel | null>;
    /** Confirma todas as inscrições ativas ainda não confirmadas do curso; retorna quantas mudaram. */
    confirmAll(courseId: string): Promise<number>;
    /** Presença: true = presente, false = faltou, null = sem marcar. */
    setAttended(id: string, attended: boolean | null): Promise<courseUserRegistrationModel>;
    /**
     * Marca a presença de todas as inscrições ativas e confirmadas do curso que
     * ainda estão sem marcar; retorna quantas mudaram.
     */
    setAttendedForUnmarked(courseId: string, attended: boolean): Promise<number>;
    delete(id: string): Promise<boolean>;
    setFicha(registrationId: string, data: Buffer, filename: string, mimeType: string): Promise<void>;
    getFicha(registrationId: string): Promise<RegistrationFichaFile | null>;
    deleteFicha(registrationId: string): Promise<boolean>;
}
