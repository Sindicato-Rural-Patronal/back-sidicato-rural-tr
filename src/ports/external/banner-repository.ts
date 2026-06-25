export type BannerButton = {
    label: string;
    url: string;
    external: boolean;
    variant: 'primary' | 'secondary';
};

export type BannerModel = {
    id: string;
    title: string;
    subtitle: string | null;
    imageUrl: string | null;
    active: boolean;
    order: number;
    buttons: BannerButton[];
    startDate: Date | null;
    endDate: Date | null;
    isDeleted: boolean;
    deletedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
};

export type BannerCreateInput = {
    title: string;
    subtitle?: string | null;
    active?: boolean;
    order?: number;
    buttons?: BannerButton[];
    startDate?: Date | null;
    endDate?: Date | null;
};

export type BannerUpdateInput = Partial<{
    title: string;
    subtitle: string | null;
    imageUrl: string | null;
    active: boolean;
    order: number;
    buttons: BannerButton[];
    startDate: Date | null;
    endDate: Date | null;
}>;

export interface BannerRepository {
    create(data: BannerCreateInput): Promise<BannerModel>;
    findAll(skip?: number, take?: number): Promise<BannerModel[]>;
    count(): Promise<number>;
    findAllActive(skip?: number, take?: number): Promise<BannerModel[]>;
    countActive(): Promise<number>;
    findById(id: string): Promise<BannerModel | null>;
    update(id: string, data: BannerUpdateInput): Promise<BannerModel | null>;
    delete(id: string): Promise<void>;
    findMaxOrder(): Promise<number>;
    reorder(ids: string[]): Promise<void>;
}
