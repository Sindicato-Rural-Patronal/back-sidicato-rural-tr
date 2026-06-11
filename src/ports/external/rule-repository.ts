import type { Permission } from '../../generated/prisma/enums';
import type { RuleModel } from '../../generated/prisma/models';

export interface RuleRepository {
    findById(id: string): Promise<RuleModel | null>;
    create(data: {
        name: string;
        permissions: Permission[];
        description?: string;
    }): Promise<RuleModel>;
    update(
        id: string,
        data: {
            name?: string;
            permissions?: Permission[];
            description?: string;
        },
    ): Promise<RuleModel | null>;
    delete(id: string): Promise<void>;
    findAll(skip?: number, take?: number): Promise<RuleModel[]>;
    count(): Promise<number>;
}
