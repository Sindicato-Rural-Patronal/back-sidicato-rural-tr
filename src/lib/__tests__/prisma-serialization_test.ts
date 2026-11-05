import { describe, it, expect } from 'vitest';
import { isPrismaSerializationError, uniqueViolationTarget } from '../prisma-errors.js';

// Formatos medidos no E2E com o @prisma/adapter-pg (Postgres 40001).
describe('isPrismaSerializationError', () => {
    it('reconhece o P2034 do Prisma', () => {
        expect(isPrismaSerializationError({ code: 'P2034' })).toBe(true);
    });

    it('reconhece o DriverAdapterError do adapter-pg (sem code, cause.kind)', () => {
        const err = Object.assign(new Error('TransactionWriteConflict'), {
            name: 'DriverAdapterError',
            cause: { kind: 'TransactionWriteConflict' },
        });
        expect(isPrismaSerializationError(err)).toBe(true);
    });

    it('reconhece a causa embrulhada em outro erro', () => {
        expect(isPrismaSerializationError({ cause: { cause: { kind: 'TransactionWriteConflict' } } })).toBe(true);
    });

    it.each([
        ['unique', { code: 'P2002' }],
        ['outro erro do adapter', { name: 'DriverAdapterError',
cause: { kind: 'UniqueConstraintViolation' } }],
        ['erro comum', new Error('boom')],
        ['null', null],
        ['texto', 'P2034'],
    ])('não confunde com %s', (_caso, err) => {
        expect(isPrismaSerializationError(err)).toBe(false);
    });
});

// P2002 medido no E2E em 30/10 com o @prisma/adapter-pg: sem `meta.target`.
describe('uniqueViolationTarget', () => {
    const adapterP2002 = (index: string) => ({
        code: 'P2002',
        meta: {
            modelName: 'FinancialTransaction',
            driverAdapterError: {
                name: 'DriverAdapterError',
                cause: {
                    originalCode: '23505',
                    kind: 'UniqueConstraintViolation',
                    constraint: { index },
                    table: 'FinancialTransaction',
                },
            },
        },
    });

    it('lê o índice do driver adapter', () => {
        expect(uniqueViolationTarget(adapterP2002('FinancialTransaction_number_key'))).toEqual([
            'FinancialTransaction_number_key',
        ]);
    });

    it('lê as colunas do driver adapter', () => {
        const err = { code: 'P2002',
meta: { driverAdapterError: { cause: { constraint: { fields: ['recurringId', 'recurringMonth'] } } } } };
        expect(uniqueViolationTarget(err)).toEqual(['recurringId', 'recurringMonth']);
    });

    it('lê o meta.target do Prisma sem adapter (array ou texto)', () => {
        expect(uniqueViolationTarget({ code: 'P2002',
meta: { target: ['number'] } })).toEqual(['number']);
        expect(uniqueViolationTarget({ code: 'P2002',
meta: { target: 'FinancialTransaction_number_key' } })).toEqual([
            'FinancialTransaction_number_key',
        ]);
    });

    it('nada quando não é P2002 ou não diz o índice', () => {
        expect(uniqueViolationTarget({ code: 'P2003',
meta: { target: ['x'] } })).toEqual([]);
        expect(uniqueViolationTarget({ code: 'P2002' })).toEqual([]);
        expect(uniqueViolationTarget(null)).toEqual([]);
    });
});
