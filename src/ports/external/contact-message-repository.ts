export type ContactMessageModel = {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    subject: string | null;
    message: string;
    read: boolean;
    isDeleted: boolean;
    deletedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
};

export type ContactMessageCreateInput = {
    name: string;
    email: string;
    phone?: string | null;
    subject?: string | null;
    message: string;
};

export type ContactMessageFilters = {
    read?: boolean;
    search?: string;
};

export interface ContactMessageRepository {
    create(data: ContactMessageCreateInput): Promise<ContactMessageModel>;
    findAll(skip?: number, take?: number, filters?: ContactMessageFilters): Promise<ContactMessageModel[]>;
    count(filters?: ContactMessageFilters): Promise<number>;
    findById(id: string): Promise<ContactMessageModel | null>;
    markAsRead(id: string): Promise<ContactMessageModel | null>;
    delete(id: string): Promise<void>;
}
