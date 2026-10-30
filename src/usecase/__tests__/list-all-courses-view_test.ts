import { describe, it, expect } from 'vitest';
import { viewFilters } from '../list-all-courses.js';

// SR-057 (A9): o curso passa de "próximos" para "Armazenados" no dia do início,
// pelo relógio de Brasília (UTC-3). startTime é hora de parede com Z.
describe('viewFilters', () => {
    it('corte é a meia-noite do dia seguinte em Brasília', () => {
        // 10:00 em Brasília de 05/10.
        const now = new Date('2026-10-05T13:00:00Z');
        expect(viewFilters('upcoming', now)).toEqual({ startsFrom: new Date('2026-10-06T00:00:00Z') });
        expect(viewFilters('stored', now)).toEqual({ startsBefore: new Date('2026-10-06T00:00:00Z') });
    });

    it('depois das 21h de Brasília o UTC já virou o dia, mas o corte não', () => {
        // 22:30 em Brasília de 05/10 = 01:30Z de 06/10.
        const now = new Date('2026-10-06T01:30:00Z');
        expect(viewFilters('stored', now)).toEqual({ startsBefore: new Date('2026-10-06T00:00:00Z') });
    });

    it('logo depois da meia-noite de Brasília o dia vira', () => {
        // 00:05 em Brasília de 06/10 = 03:05Z.
        const now = new Date('2026-10-06T03:05:00Z');
        expect(viewFilters('stored', now)).toEqual({ startsBefore: new Date('2026-10-07T00:00:00Z') });
    });
});
