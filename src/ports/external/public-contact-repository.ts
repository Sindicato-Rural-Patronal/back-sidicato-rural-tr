import type { PublicContactModel } from '../../generated/prisma/models/PublicContact.js';

export type { PublicContactModel };

export type PublicContactWithPerson = PublicContactModel & {
    userData: {
        id: string;
        name: string;
        email: string;
        phone: string;
        avatar: string | null;
    };
};

export interface PublicContactRepository {
    /** Na ordem da página Contato; ignora pessoas excluídas. */
    list(): Promise<PublicContactWithPerson[]>;
    findById(id: string): Promise<PublicContactModel | null>;
    findByPerson(userDataId: string): Promise<PublicContactModel | null>;
    count(): Promise<number>;
    create(data: {
 userDataId: string;
title: string | null;
order: number 
}): Promise<PublicContactModel>;
    updateTitle(id: string, title: string | null): Promise<PublicContactModel>;
    delete(id: string): Promise<void>;
    reorder(ids: string[]): Promise<void>;
}
