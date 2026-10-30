import { describe, it, expect } from 'vitest';
import {
    nextFinanceNumber,
    pickFinanceNumber,
    financeTransactionLabel,
    financeNumberSearchTerm,
    type FinanceNumberReader,
} from '../finance-number.js';

// Banco de mentira: os lançamentos com número, inclusive os excluídos.
function store(rows: {
 id: string;
number: number;
isDeleted?: boolean 
}[] = []) {
    const all = rows.map(r => ({ ...r,
isDeleted: r.isDeleted ?? false }));
    const reader: FinanceNumberReader = {
        maxNumber: async () => (all.length ? Math.max(...all.map(r => r.number)) : null),
        ownerOf: async n => {
            const r = all.find(x => x.number === n);
            return r ? { id: r.id,
isDeleted: r.isDeleted } : null;
        },
    };
    let seq = 0;
    // Grava como o adapter: escolhe o número e insere.
    async function create(typed?: number) {
        const picked = await pickFinanceNumber(reader, typed);
        if ('conflict' in picked) return picked;
        seq += 1;
        all.push({ id: `novo-${seq}`,
number: picked.number,
isDeleted: false });
        return picked;
    }
    return { reader,
create,
all };
}

describe('nextFinanceNumber', () => {
    it('começa em 1 e depois é o maior + 1', () => {
        expect(nextFinanceNumber(null)).toBe(1);
        expect(nextFinanceNumber(127)).toBe(128);
    });
});

describe('pickFinanceNumber: maior + 1, buraco e salto (decisão 005, item 2)', () => {
    it('sem número digitado, dá o maior + 1, contando os excluídos', async () => {
        const s = store([
            { id: 'a',
number: 1 },
            { id: 'b',
number: 2,
isDeleted: true },
        ]);
        expect(await s.create()).toEqual({ number: 3 });
        expect(await s.create()).toEqual({ number: 4 });
    });

    it('banco vazio: o primeiro automático é 1', async () => {
        expect(await store().create()).toEqual({ number: 1 });
    });

    it('buraco: o digitado abaixo do próximo é aceito e a sequência não muda', async () => {
        const s = store([
            { id: 'a',
number: 1 },
            { id: 'b',
number: 127 },
        ]);
        expect(await s.create(50)).toEqual({ number: 50 });
        // O automático continua do maior (127), não preenche o buraco.
        expect(await s.create()).toEqual({ number: 128 });
        expect(await s.create()).toEqual({ number: 129 });
    });

    it('salto: o digitado acima do próximo faz a sequência continuar dele', async () => {
        const s = store([{ id: 'a',
number: 127 }]);
        expect(await s.create(5000)).toEqual({ number: 5000 });
        expect(await s.create()).toEqual({ number: 5001 });
    });

    it('número de outro lançamento: conflito, e nada é gravado', async () => {
        const s = store([{ id: 'a',
number: 123 }]);
        expect(await s.create(123)).toEqual({ conflict: { number: 123,
deleted: false } });
        expect(s.all).toHaveLength(1);
    });

    it('número de um lançamento excluído: conflito, o número não volta a ser usado', async () => {
        const s = store([{ id: 'a',
number: 7,
isDeleted: true }]);
        expect(await s.create(7)).toEqual({ conflict: { number: 7,
deleted: true } });
        // E o automático também não o reaproveita.
        expect(await s.create()).toEqual({ number: 8 });
    });

    it('na edição, manter o próprio número não é conflito', async () => {
        const s = store([{ id: 'a',
number: 12 }]);
        expect(await pickFinanceNumber(s.reader, 12, 'a')).toEqual({ number: 12 });
        expect(await pickFinanceNumber(s.reader, 12, 'outro')).toEqual({ conflict: { number: 12,
deleted: false } });
    });
});

describe('financeTransactionLabel', () => {
    it('"nº 123 — descrição", e só a descrição quando não há número', () => {
        expect(financeTransactionLabel(123, 'Compra de adubo')).toBe('nº 123 — Compra de adubo');
        expect(financeTransactionLabel(null, 'Compra de adubo')).toBe('Compra de adubo');
    });
});

describe('financeNumberSearchTerm', () => {
    it.each([
        ['45', 45],
        [' 45 ', 45],
        ['0045', 45],
        ['2147483647', 2147483647],
    ])('"%s" é o nº %s', (term, n) => {
        expect(financeNumberSearchTerm(term)).toBe(n);
    });

    it.each(['', 'abc', '45a', '4.5', '-3', '0', '000', '2147483648', '99999999999999999999'])(
        '"%s" não é um nº',
        term => {
            expect(financeNumberSearchTerm(term)).toBeNull();
        },
    );
});
