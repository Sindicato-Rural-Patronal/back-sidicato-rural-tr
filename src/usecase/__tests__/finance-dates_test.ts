import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import '../../lib/zod-config.js';
import { FINANCE_DATE_MESSAGE, financeDate, isFinanceYear } from '../finance-dates.js';
import { isMonth } from '../finance-recurrences.js';
import { CreateFinanceRecurrenceUseCase } from '../finance-recurrences.js';
import type { FinanceRepository } from '../../ports/external/finance-repository.js';

// SR-055: data e mês do Financeiro com ano fora de 1900–2999 eram aceitos pelo
// Zod e recusados pelo Postgres (500), ou quebravam a geração de recorrências.

const message = (input: unknown) => {
    const r = z.object({ date: financeDate }).safeParse({ date: input });
    return r.success ? null : r.error.issues[0]?.message;
};

describe('financeDate', () => {
    it('aceita a data do painel e o ISO', () => {
        expect(message('2026-10-30')).toBeNull();
        expect(message('2026-10-30T00:00:00.000Z')).toBeNull();
        expect(message('1900-01-01')).toBeNull();
        expect(message('2999-12-31')).toBeNull();
    });

    it('ano 0, negativo, de 5 dígitos ou fora de 1900–2999 → "Data inválida…"', () => {
        for (const input of ['0000-01-01', '0202-10-30', '-005000-01-01T00:00:00.000Z', '+020266-01-01', '1899-12-31', '3000-01-01']) {
            expect(message(input), input).toBe(FINANCE_DATE_MESSAGE);
        }
    });

    it('texto que não é data também → "Data inválida…"', () => {
        expect(message('ontem')).toBe(FINANCE_DATE_MESSAGE);
        expect(message('2026-13-01')).toBe(FINANCE_DATE_MESSAGE);
    });

    it('isFinanceYear', () => {
        expect(isFinanceYear(2026)).toBe(true);
        expect(isFinanceYear(0)).toBe(false);
        expect(isFinanceYear(26)).toBe(false);
    });
});

describe('mês do Financeiro', () => {
    it('isMonth confere o formato e o ano', () => {
        expect(isMonth('2026-10')).toBe(true);
        expect(isMonth('0026-01')).toBe(false);
        expect(isMonth('0000-01')).toBe(false);
        expect(isMonth('2026-13')).toBe(false);
    });

    it('recorrência com mês de início "0026-01" é recusada na criação (antes quebrava a geração)', async () => {
        const repo = { createRecurrence: async () => ({ id: 'r' }) } as unknown as FinanceRepository;
        const r = await new CreateFinanceRecurrenceUseCase(repo).execute({
            type: 'OUT',
            description: 'ALUGUEL',
            amountCents: 100,
            dayOfMonth: 10,
            startMonth: '0026-01',
        });
        expect(r.error?.message).toBe('Mês inválido (use AAAA-MM, com ano entre 1900 e 2999)');
    });
});
