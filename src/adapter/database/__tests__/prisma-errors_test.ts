import { describe, it, expect } from 'vitest';
import { registroInexistente, semRegistro } from '../prisma-errors.js';

describe('registroInexistente', () => {
    it('reconhece o codigo do Prisma para registro que nao existe', () => {
        expect(registroInexistente({ code: 'P2025' })).toBe(true);
    });

    it('nao confunde com outras falhas do banco', () => {
        // P2002 e unique violado, P1001 e banco fora do ar: nenhum dos dois
        // significa "nao encontrado", e virar 404 esconderia o problema.
        expect(registroInexistente({ code: 'P2002' })).toBe(false);
        expect(registroInexistente({ code: 'P1001' })).toBe(false);
        expect(registroInexistente(new Error('timeout'))).toBe(false);
        expect(registroInexistente(null)).toBe(false);
        expect(registroInexistente({ code: 404 })).toBe(false);
    });
});

describe('semRegistro', () => {
    it('devolve o valor combinado quando o registro nao existe', () => {
        expect(semRegistro({ code: 'P2025' }, null)).toBeNull();
        expect(semRegistro({ code: 'P2025' }, false)).toBe(false);
    });

    it('relanca qualquer outra falha, em vez de virar "nao encontrado"', () => {
        const queda = Object.assign(new Error('banco fora do ar'), { code: 'P1001' });
        expect(() => semRegistro(queda, null)).toThrow(queda);
    });
});
