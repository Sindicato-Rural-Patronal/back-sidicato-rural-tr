import type { PrismaClient } from '@prisma/client/extension';
import type { UnimedBeneficiarioModel } from '../../generated/prisma/models/UnimedBeneficiario.js';
import type {
    UnimedRepository,
    UnimedCreateInput,
    UnimedUpdateInput,
    UnimedListFilters,
    UnimedWithUser,
} from '../../ports/external/unimed-repository.js';

// Só os campos básicos do UserData — nunca a ficha inteira na listagem/detalhe.
const userDataSelect = { select: { id: true, name: true, cpf: true } } as const;

export function createUnimedAdapter(prisma: PrismaClient): UnimedRepository {
    return new UnimedAdapter(prisma);
}

class UnimedAdapter implements UnimedRepository {
    constructor(private prisma: PrismaClient) {}

    create(input: UnimedCreateInput): Promise<UnimedBeneficiarioModel> {
        return this.prisma.unimedBeneficiario.create({ data: input });
    }

    update(id: string, input: UnimedUpdateInput): Promise<UnimedBeneficiarioModel> {
        return this.prisma.unimedBeneficiario.update({ where: { id }, data: input });
    }

    async softDelete(id: string): Promise<boolean> {
        const r = await this.prisma.unimedBeneficiario.updateMany({
            where: { id, isDeleted: false },
            data: { isDeleted: true, deletedAt: new Date() },
        });
        return r.count === 1;
    }

    findById(id: string): Promise<UnimedWithUser | null> {
        return this.prisma.unimedBeneficiario.findFirst({
            where: { id, isDeleted: false },
            include: { userData: userDataSelect },
        });
    }

    findByUserDataId(userDataId: string): Promise<UnimedBeneficiarioModel | null> {
        return this.prisma.unimedBeneficiario.findFirst({
            where: { userDataId, isDeleted: false },
        });
    }

    async list(filters: UnimedListFilters): Promise<{ items: UnimedWithUser[]; total: number }> {
        const { page, limit, search } = filters;
        // Busca filtra pelo UserData vinculado (nome ou CPF).
        const where = {
            isDeleted: false,
            ...(search
                ? {
                      userData: {
                          OR: [
                              { name: { contains: search, mode: 'insensitive' as const } },
                              { cpf: { contains: search } },
                          ],
                      },
                  }
                : {}),
        };
        const [items, total] = await Promise.all([
            this.prisma.unimedBeneficiario.findMany({
                where,
                include: { userData: userDataSelect },
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
            this.prisma.unimedBeneficiario.count({ where }),
        ]);
        return { items, total };
    }
}
