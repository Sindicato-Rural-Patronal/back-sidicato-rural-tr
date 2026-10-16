import { describe, it, expect } from 'vitest';
import { isPrismaSerializationError } from '../prisma-errors.js';

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
