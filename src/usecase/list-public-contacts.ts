import type {
    UserAdminRepository,
    PublicContactItem,
} from '../ports/external/user-admin-repository.js';

type ListPublicContactsResponse = {
    error?: Error;
    contacts?: PublicContactItem[];
};

export class ListPublicContactsUseCase {
    constructor(private readonly userAdminRepository: UserAdminRepository) {}

    async execute(): Promise<ListPublicContactsResponse> {
        const contacts = await this.userAdminRepository.findAllPublic();
        return { contacts };
    }
}
