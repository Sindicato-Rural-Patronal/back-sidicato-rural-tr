import type { PrismaClient } from '@prisma/client/extension';
import type { RuleRepository } from '../../ports/external/rule-repository';
import type { Permission } from '../../generated/prisma/enums';
import type { RuleModel } from '../../generated/prisma/models';

export function createRuleAdapter(prisma: PrismaClient): RuleRepository {
    return new RuleAdapter(prisma);
}
export class RuleAdapter implements RuleRepository {
    constructor(private prisma: PrismaClient) {}
    findById(id: string): Promise<RuleModel | null> {
        return this.prisma.rule.findUnique({
            where: { id },
        });
    }
    create(data: {
 name: string;
permissions: Permission[] 
}): Promise<RuleModel> {
        return this.prisma.rule.create({
            data,
        });
    }
    update(
        id: string,
        data: {
            name?: string;
            permissions?: Permission[];
        },
    ): Promise<RuleModel | null> {
        return this.prisma.rule.update({
            where: { id },
            data,
        });
    }
    delete(id: string): Promise<void> {
        return this.prisma.rule.delete({
            where: { id },
        });
    }
    findAll(skip?: number, take?: number): Promise<RuleModel[]> {
        return this.prisma.rule.findMany({ skip,
take });
    }

    count(): Promise<number> {
        return this.prisma.rule.count();
    }
}
