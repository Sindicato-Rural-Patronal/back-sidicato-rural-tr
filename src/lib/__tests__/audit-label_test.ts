import { describe, it, expect } from 'vitest';
import { createdTransactionLabel, editedTransactionLabel, isTransactionCreate, isTransactionEdit } from '../audit-label.js';
import { describeAuditAction } from '../audit-sentence.js';

describe('isTransactionCreate', () => {
    it('só o POST da lista de lançamentos', () => {
        expect(isTransactionCreate('POST', '/admin/finance/transactions')).toBe(true);
        expect(isTransactionCreate('POST', '/admin/finance/transactions/')).toBe(true);
        expect(isTransactionCreate('GET', '/admin/finance/transactions')).toBe(false);
        expect(isTransactionCreate('PATCH', '/admin/finance/transactions')).toBe(false);
        expect(isTransactionCreate('POST', '/admin/finance/transfers')).toBe(false);
        expect(isTransactionCreate(
            'POST',
            '/admin/finance/transactions/0d9f6c40-0000-4000-8000-000000000000/attachments',
        )).toBe(false);
    });
});

describe('createdTransactionLabel', () => {
    it('lê o número e a descrição da resposta', () => {
        const body = JSON.stringify({ id: 'x',
number: 123,
description: 'Compra de adubo' });
        expect(createdTransactionLabel(body)).toBe('nº 123 — Compra de adubo');
        expect(createdTransactionLabel(Buffer.from(body))).toBe('nº 123 — Compra de adubo');
    });

    it('sem número, só a descrição', () => {
        expect(createdTransactionLabel(JSON.stringify({ number: null,
description: 'Luz' }))).toBe('Luz');
    });

    it('resposta que não dá para ler → null', () => {
        expect(createdTransactionLabel('não é json')).toBeNull();
        expect(createdTransactionLabel(JSON.stringify({ number: 1 }))).toBeNull();
        expect(createdTransactionLabel(JSON.stringify({ number: 1,
description: '  ' }))).toBeNull();
        expect(createdTransactionLabel(JSON.stringify(null))).toBeNull();
        expect(createdTransactionLabel(undefined)).toBeNull();
        expect(createdTransactionLabel({ number: 1,
description: 'x' })).toBeNull();
    });
});

describe('frase de criar lançamento', () => {
    const entry = (targetLabel: string | null) => ({
        method: 'POST',
        path: '/admin/finance/transactions',
        entity: 'Lançamento',
        targetLabel,
    });

    it('cita o número, como a edição', () => {
        expect(describeAuditAction(entry('nº 123 — Compra de adubo'))).toBe('Criou o lançamento "nº 123 — Compra de adubo"');
    });

    it('linha antiga, sem rótulo, continua "Criou um lançamento"', () => {
        expect(describeAuditAction(entry(null))).toBe('Criou um lançamento');
    });
});

describe('isTransactionEdit', () => {
    it('só o PATCH do lançamento', () => {
        const id = '0d9f6c40-0000-4000-8000-000000000000';
        expect(isTransactionEdit('PATCH', `/admin/finance/transactions/${id}`)).toBe(true);
        expect(isTransactionEdit('DELETE', `/admin/finance/transactions/${id}`)).toBe(false);
        expect(isTransactionEdit('PATCH', `/admin/finance/transactions/${id}/attachments`)).toBe(false);
        expect(isTransactionEdit('PATCH', '/admin/finance/transactions')).toBe(false);
        expect(isTransactionEdit('PATCH', `/admin/finance/accounts/${id}`)).toBe(false);
    });
});

describe('editedTransactionLabel', () => {
    it('Nº mudou: Nº novo, o antigo entre parênteses e a descrição nova', () => {
        expect(editedTransactionLabel('nº 301 — VELHA', { number: 250,
description: 'NOVA' })).toBe('nº 250 (antes nº 301) — NOVA');
    });

    it('Nº igual: como antes, mas com a descrição de depois', () => {
        expect(editedTransactionLabel('nº 7 — VELHA', { number: 7,
description: 'NOVA' })).toBe('nº 7 — NOVA');
    });

    it('sem número: só a descrição', () => {
        expect(editedTransactionLabel('VELHA', { number: null,
description: 'NOVA' })).toBe('NOVA');
        expect(editedTransactionLabel(null, { number: null,
description: 'NOVA' })).toBe('NOVA');
    });

    it('sem Nº antes e com Nº depois: não inventa o antigo', () => {
        expect(editedTransactionLabel('VELHA', { number: 9,
description: 'NOVA' })).toBe('nº 9 — NOVA');
    });
});
