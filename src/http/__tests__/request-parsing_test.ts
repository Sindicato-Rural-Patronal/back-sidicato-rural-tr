import { describe, it, expect } from 'vitest';
import {
    AJV_CUSTOM_OPTIONS,
    INT4_MAX,
    INT4_MIN,
    INVALID_JSON_MESSAGE,
    parseJsonBody,
    withInputNumberLimits,
} from '../lib/request-parsing.js';

// SR-055: entrada errada responde 400, e não 500.

function parse(body: string): {
    err: (Error & { statusCode?: number }) | null;
    value: unknown;
} {
    let result: {
        err: (Error & { statusCode?: number }) | null;
        value: unknown;
    } = {
        err: null,
        value: undefined,
    };
    parseJsonBody({} as never, body, (err, value) => {
        result = {
            err: err as (Error & { statusCode?: number }) | null,
            value,
        };
    });
    return result;
}

describe('parseJsonBody', () => {
    it('corpo vazio vale {}', () => {
        expect(parse('')).toEqual({
            err: null,
            value: {},
        });
    });

    it('JSON válido passa', () => {
        expect(parse('{"a":1}').value).toEqual({ a: 1 });
    });

    it('JSON malformado → erro 400 em português', () => {
        const { err } = parse('{"a":');
        expect(err?.message).toBe(INVALID_JSON_MESSAGE);
        expect(err?.statusCode).toBe(400);
    });
});

describe('withInputNumberLimits', () => {
    it('inteiro ganha os limites do int4', () => {
        expect(withInputNumberLimits({ type: 'integer' })).toEqual({
            type: 'integer',
            minimum: INT4_MIN,
            maximum: INT4_MAX,
        });
    });

    it('não afrouxa limite que a rota já declarou', () => {
        expect(withInputNumberLimits({
            type: 'integer',
            minimum: 1,
            maximum: 1000,
        })).toEqual({
            type: 'integer',
            minimum: 1,
            maximum: 1000,
        });
    });

    it('number ganha o limite do número finito (barra o Infinity de "1e400")', () => {
        const out = withInputNumberLimits<Record<string, unknown>>({ type: ['number', 'null'] }) as {
            minimum: number;
            maximum: number;
        };
        expect(out.maximum).toBe(Number.MAX_VALUE);
        expect(out.minimum).toBe(-Number.MAX_VALUE);
    });

    it('desce em properties e items, e não mexe em enum nem no original', () => {
        const schema = {
            type: 'object',
            properties: {
                order: { type: 'integer' },
                name: { type: 'string' },
                type: {
                    type: 'string',
                    enum: ['IN', 'OUT'],
                },
                rows: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: { priceCents: { type: 'integer' } },
                    },
                },
            },
        };
        const out = withInputNumberLimits(schema) as typeof schema & {
            properties: {
                order: { maximum?: number };
                name: { maximum?: number };
                rows: { items: { properties: { priceCents: { maximum?: number } } } };
            };
        };
        expect(out.properties.order.maximum).toBe(INT4_MAX);
        expect(out.properties.rows.items.properties.priceCents.maximum).toBe(INT4_MAX);
        expect(out.properties.name.maximum).toBeUndefined();
        expect(out.properties.type).toEqual({
            type: 'string',
            enum: ['IN', 'OUT'],
        });
        // O schema compartilhado entre rotas não é alterado.
        expect((schema.properties.order as { maximum?: number }).maximum).toBeUndefined();
    });

    it('o Ajv não usa strictNumbers (com ela o Infinity passa até pelo maximum)', () => {
        expect(AJV_CUSTOM_OPTIONS.strictNumbers).toBe(false);
    });
});
