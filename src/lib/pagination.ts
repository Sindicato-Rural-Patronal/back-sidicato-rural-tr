export type PagedResult<T> = {
    data: T[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
};

/**
 * Runs a paginated query: computes skip, fetches the page and the total count in
 * parallel, and assembles the standard paged payload.
 */
export async function paginate<T>(
    page: number,
    limit: number,
    findAll: (skip: number, take: number) => Promise<T[]>,
    count: () => Promise<number>,
): Promise<PagedResult<T>> {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([findAll(skip, limit), count()]);
    return { data,
total,
page,
limit,
totalPages: Math.ceil(total / limit) };
}
