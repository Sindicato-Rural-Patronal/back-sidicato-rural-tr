import type { FastifyRequest, RouteOptions } from 'fastify';

// Leitura da requisição, a mesma no servidor (index.ts) e no app dos E2E
// (SR-055): entrada errada responde 400 com a mensagem em português, e não 500.

/**
 * Opções do Ajv que valida o JSON schema das rotas.
 * - `example` é palavra-chave da documentação (Swagger), não de validação.
 * - `strictNumbers: false`: com o padrão do Ajv 8 (true), `?page=1e400`, que a
 *   coerção transforma em Infinity, passava como "integer" sem conferir nem o
 *   `maximum`, e estourava no Prisma (500). Desligado, o Infinity cai no
 *   `maximum` que `withInputNumberLimits` põe em todo número.
 */
export const AJV_CUSTOM_OPTIONS = {
    keywords: ['example'],
    strictNumbers: false,
};

export const INVALID_JSON_MESSAGE = 'O corpo da requisição não é um JSON válido.';

/**
 * Parser de `application/json`. Corpo vazio vale `{}` (o painel manda DELETE e
 * POST de ação com o content-type e sem corpo). JSON malformado responde 400;
 * antes, o erro de sintaxe saía sem `statusCode` e o apiErrorHandler dava 500.
 */
export function parseJsonBody(
    _request: FastifyRequest,
    body: string | Buffer,
    done: (err: Error | null, body?: unknown) => void,
) {
    const text = typeof body === 'string' ? body : body?.toString('utf8');
    if (!text) {
        done(null, {});
        return;
    }
    try {
        done(null, JSON.parse(text));
    } catch {
        done(Object.assign(new Error(INVALID_JSON_MESSAGE), { statusCode: 400 }), undefined);
    }
}

// ── Números de entrada têm limite ───────────────────────────────────────────
// As colunas `Int` do Postgres vão de −2.147.483.648 a 2.147.483.647. Inteiro
// maior no corpo ou na query (`order`, valores em centavos) passava pelo JSON
// schema e estourava no banco (P2020 → 500). E `1e400`, na query ou no JSON,
// vira Infinity, que passava como "integer" e estourava no Prisma.
// Toda propriedade "integer" dos schemas de entrada ganha os limites do int4, e
// toda "number" os do número finito, sem afrouxar o limite que a rota já
// declarou. Fora deles, 400 do Ajv com o nome do campo.

export const INT4_MAX = 2147483647;
export const INT4_MIN = -2147483648;

type JsonSchema = Record<string, unknown>;

function hasType(type: unknown, name: string): boolean {
    return type === name || (Array.isArray(type) && type.includes(name));
}

function limits(type: unknown): [number, number] | null {
    if (hasType(type, 'integer')) return [INT4_MIN, INT4_MAX];
    if (hasType(type, 'number')) return [-Number.MAX_VALUE, Number.MAX_VALUE];
    return null;
}

/** Cópia do schema com `minimum`/`maximum` em toda propriedade numérica. */
export function withInputNumberLimits<T>(schema: T): T {
    if (Array.isArray(schema)) return schema.map(item => withInputNumberLimits(item)) as T;
    if (!schema || typeof schema !== 'object') return schema;
    const out: JsonSchema = {};
    for (const [key, value] of Object.entries(schema as JsonSchema)) {
        out[key] = key === 'enum' || key === 'example' || key === 'default' ? value : withInputNumberLimits(value);
    }
    const range = limits(out.type);
    if (range) {
        const [min, max] = range;
        out.maximum = typeof out.maximum === 'number' ? Math.min(out.maximum, max) : max;
        out.minimum = typeof out.minimum === 'number' ? Math.max(out.minimum, min) : min;
    }
    return out as T;
}

/** Hook `onRoute`: aplica os limites ao corpo, à query e aos parâmetros. */
export function limitNumberInputs(route: RouteOptions) {
    const schema = route.schema;
    if (!schema) return;
    route.schema = {
        ...schema,
        ...(schema.body ? { body: withInputNumberLimits(schema.body) } : {}),
        ...(schema.querystring ? { querystring: withInputNumberLimits(schema.querystring) } : {}),
        ...(schema.params ? { params: withInputNumberLimits(schema.params) } : {}),
    };
}
