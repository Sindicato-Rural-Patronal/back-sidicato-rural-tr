// Shared OpenAPI/Swagger schema fragments reused across routers.

// Standard error body: { error: string }
export const errorResponse = {
    type: 'object',
    properties: { error: { type: 'string' } },
} as const;

// Pagination query params: ?page=&limit=
export const paginationQuerystring = {
    type: 'object',
    properties: {
        page: { type: 'integer',
minimum: 1,
default: 1 },
        limit: { type: 'integer',
minimum: 1,
maximum: 1000,
default: 20 },
    },
} as const;

// Standard paginated response wrapping an item schema.
export const pagedResponse = (itemSchema: object) => ({
    type: 'object',
    properties: {
        data: { type: 'array',
items: itemSchema },
        total: { type: 'integer' },
        page: { type: 'integer' },
        limit: { type: 'integer' },
        totalPages: { type: 'integer' },
    },
});
