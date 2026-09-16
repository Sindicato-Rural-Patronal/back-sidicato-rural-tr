import type { PrismaClient } from '@prisma/client/extension';
import type {
    ConvenioRepository,
    ConvenioModel,
    ConvenioInput,
    ConvenioUpdateInput,
    ConvenioMenuItem,
} from '../../ports/external/convenio-repository.js';

export function createConvenioAdapter(prisma: PrismaClient): ConvenioRepository {
    return new ConvenioAdapter(prisma);
}

const ORDER = [{ order: 'asc' }, { name: 'asc' }] as const;

class ConvenioAdapter implements ConvenioRepository {
    constructor(private prisma: PrismaClient) {}

    listMenu(): Promise<ConvenioMenuItem[]> {
        return this.prisma.convenio.findMany({
            where: { isActive: true },
            orderBy: ORDER,
            select: { id: true,
slug: true,
name: true,
subtitle: true,
logoUrl: true,
order: true },
        });
    }

    findAll(): Promise<ConvenioModel[]> {
        return this.prisma.convenio.findMany({ orderBy: ORDER });
    }

    findById(id: string): Promise<ConvenioModel | null> {
        return this.prisma.convenio.findUnique({ where: { id } });
    }

    findBySlug(slug: string): Promise<ConvenioModel | null> {
        return this.prisma.convenio.findUnique({ where: { slug } });
    }

    create(data: ConvenioInput): Promise<ConvenioModel> {
        return this.prisma.convenio.create({ data });
    }

    update(id: string, data: ConvenioUpdateInput): Promise<ConvenioModel> {
        return this.prisma.convenio.update({ where: { id },
data });
    }

    async delete(id: string): Promise<void> {
        await this.prisma.convenio.delete({ where: { id } });
    }
}
