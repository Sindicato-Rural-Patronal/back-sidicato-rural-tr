import { permitions } from "../../generated/prisma/enums";
import { RuleModel } from "../../generated/prisma/models";

export interface RuleRepository {
    findById(id: string): Promise<RuleModel | null>;
    create(data: { name: string; permitions: permitions[]; description?: string }): Promise<RuleModel>;
    update(id: string, data: { name?: string; permitions?: permitions[]; description?: string }): Promise<RuleModel | null>;
    delete(id: string): Promise<void>;
    findAll(): Promise<RuleModel[]>;
}