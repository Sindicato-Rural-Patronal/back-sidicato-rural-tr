export type NewsStatus = 'PUBLISHED' | 'UNPUBLISHED';

export type NewsCreateData = {
    title: string;
    content: string;
    summary?: string;
    status?: NewsStatus;
    publishedAt?: Date;
    publishAt?: Date | null;
};

export type NewsUpdateData = {
    title?: string;
    content?: string;
    summary?: string | null;
    bannerUrl?: string;
    status?: NewsStatus;
    publishedAt?: Date | null;
    publishAt?: Date | null;
};

/**
 * Recorte pelo agendamento, sempre em relação a um instante:
 * - `visible`: já está no ar (sem agendamento ou agendada para antes);
 * - `scheduled`: agendada para depois (ainda não aparece no site).
 */
export type NewsScheduleFilter = {
    at: Date;
    state: 'visible' | 'scheduled';
};

export type NewsListFilters = {
    status?: NewsStatus;
    schedule?: NewsScheduleFilter;
    /** Busca por título (sem diferenciar maiúsculas). */
    search?: string;
};

export type NewsModel = {
    id: string;
    title: string;
    content: string;
    summary: string | null;
    bannerUrl: string | null;
    status: NewsStatus;
    publishedAt: Date | null;
    publishAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
};

export interface NewsRepository {
    create(data: NewsCreateData): Promise<NewsModel>;
    findById(id: string): Promise<NewsModel | null>;
    findAll(filters: NewsListFilters, skip?: number, take?: number): Promise<NewsModel[]>;
    count(filters: NewsListFilters): Promise<number>;
    update(id: string, data: NewsUpdateData): Promise<NewsModel | null>;
    delete(id: string): Promise<boolean>;
    updateBanner(id: string, bannerUrl: string): Promise<NewsModel | null>;
}
