import type { PrismaClient } from '@prisma/client/extension';
import type {
    BannerRepository,
    BannerModel,
    BannerCreateInput,
    BannerUpdateInput,
    BannerButton,
} from '../../ports/external/banner-repository.js';

function cast(row: unknown): BannerModel {
    const r = row as Record<string, unknown>;
    return {
        ...(r as Omit<BannerModel, 'buttons'>),
        buttons: (r.buttons as BannerButton[]) ?? [],
    };
}

export function createBannerAdapter(prisma: PrismaClient): BannerRepository {
    return new BannerAdapter(prisma);
}

class BannerAdapter implements BannerRepository {
    constructor(private prisma: PrismaClient) {}

    async create(data: BannerCreateInput): Promise<BannerModel> {
        const row = await this.prisma.banner.create({
            data: {
                title: data.title,
                subtitle: data.subtitle ?? null,
                active: data.active ?? true,
                order: data.order ?? 0,
                buttons: (data.buttons as unknown as object[]) ?? [],
                startDate: data.startDate ?? null,
                endDate: data.endDate ?? null,
            },
        });
        return cast(row);
    }

    async findAll(skip?: number, take?: number): Promise<BannerModel[]> {
        const rows = await this.prisma.banner.findMany({
            where: { isDeleted: false },
            orderBy: { order: 'asc' },
            skip,
            take,
        });
        return rows.map(cast);
    }

    async count(): Promise<number> {
        return this.prisma.banner.count({ where: { isDeleted: false } });
    }

    async findAllActive(skip?: number, take?: number): Promise<BannerModel[]> {
        const now = new Date();
        const rows = await this.prisma.banner.findMany({
            where: {
                isDeleted: false,
                active: true,
                AND: [
                    { OR: [{ startDate: null }, { startDate: { lte: now } }] },
                    { OR: [{ endDate: null }, { endDate: { gte: now } }] },
                ],
            },
            orderBy: { order: 'asc' },
            skip,
            take,
        });
        return rows.map(cast);
    }

    async countActive(): Promise<number> {
        const now = new Date();
        return this.prisma.banner.count({
            where: {
                isDeleted: false,
                active: true,
                AND: [
                    { OR: [{ startDate: null }, { startDate: { lte: now } }] },
                    { OR: [{ endDate: null }, { endDate: { gte: now } }] },
                ],
            },
        });
    }

    async findById(id: string): Promise<BannerModel | null> {
        const row = await this.prisma.banner.findFirst({ where: { id,
isDeleted: false } });
        return row ? cast(row) : null;
    }

    async update(id: string, data: BannerUpdateInput): Promise<BannerModel | null> {
        const row = await this.prisma.banner.update({
            where: { id },
            data: {
                ...data,
                buttons: data.buttons !== undefined
                    ? (data.buttons as unknown as object[])
                    : undefined,
            },
        });
        return cast(row);
    }

    async delete(id: string): Promise<void> {
        await this.prisma.banner.update({
            where: { id },
            data: { isDeleted: true,
deletedAt: new Date() },
        });
    }

    async findMaxOrder(): Promise<number> {
        const result = await this.prisma.banner.aggregate({
            where: { isDeleted: false },
            _max: { order: true },
        });
        return result._max.order ?? -1;
    }

    async reorder(ids: string[]): Promise<void> {
        await this.prisma.$transaction(
            ids.map((id, index) =>
                this.prisma.banner.update({ where: { id },
data: { order: index } }),
            ),
        );
    }
}
