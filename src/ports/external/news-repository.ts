export type NewsStatus = 'PUBLICADO' | 'NAO_PUBLICADO';

export type NewsCreateData = {
    title: string;
    content: string;
    summary?: string;
    status?: NewsStatus;
    publishedAt?: Date;
};

export type NewsUpdateData = {
    title?: string;
    content?: string;
    summary?: string | null;
    bannerUrl?: string;
    status?: NewsStatus;
    publishedAt?: Date | null;
};

export type NewsModel = {
    id: string;
    title: string;
    content: string;
    summary: string | null;
    bannerUrl: string | null;
    status: NewsStatus;
    publishedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
};

export interface NewsRepository {
    create(data: NewsCreateData): Promise<NewsModel>;
    findById(id: string): Promise<NewsModel | null>;
    findAll(statusFilter?: NewsStatus, skip?: number, take?: number): Promise<NewsModel[]>;
    count(statusFilter?: NewsStatus): Promise<number>;
    update(id: string, data: NewsUpdateData): Promise<NewsModel | null>;
    delete(id: string): Promise<boolean>;
    updateBanner(id: string, bannerUrl: string): Promise<NewsModel | null>;
}
