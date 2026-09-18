import { describe, it, expect } from 'vitest';
import {
    MAX_OCCURRENCES,
    conflictMessage,
    findConflict,
    generateOccurrences,
    nowWallClock,
    overlaps,
    type RoomOccupant,
} from '../room-availability.js';

const slot = (start: string, end: string) => ({ startTime: new Date(start),
endTime: new Date(end) });
const days = (list: { startTime: Date }[]) => list.map(o => o.startTime.toISOString().slice(0, 16));

describe('overlaps', () => {
    const a = slot('2026-10-05T08:00:00.000Z', '2026-10-05T12:00:00.000Z');

    it('encostar não é conflito (termina quando o outro começa)', () => {
        expect(overlaps(a, slot('2026-10-05T12:00:00.000Z', '2026-10-05T14:00:00.000Z'))).toBe(false);
        expect(overlaps(a, slot('2026-10-05T06:00:00.000Z', '2026-10-05T08:00:00.000Z'))).toBe(false);
    });

    it('um minuto de sobreposição já é conflito', () => {
        expect(overlaps(a, slot('2026-10-05T11:59:00.000Z', '2026-10-05T14:00:00.000Z'))).toBe(true);
        expect(overlaps(a, slot('2026-10-05T06:00:00.000Z', '2026-10-05T08:01:00.000Z'))).toBe(true);
    });

    it('contido e contendo são conflito', () => {
        expect(overlaps(a, slot('2026-10-05T09:00:00.000Z', '2026-10-05T10:00:00.000Z'))).toBe(true);
        expect(overlaps(a, slot('2026-10-04T00:00:00.000Z', '2026-10-06T00:00:00.000Z'))).toBe(true);
    });
});

describe('conflictMessage', () => {
    const base = { id: 'x',
startTime: new Date('2026-10-05T08:00:00.000Z'),
endTime: new Date('2026-10-05T12:00:00.000Z') };

    it('nomeia o tipo, o título e o horário "de parede"', () => {
        expect(conflictMessage({ ...base,
kind: 'COURSE',
title: 'Irrigação' })).toBe('Sala ocupada: Curso "Irrigação" em 05/10 08:00–12:00');
        expect(conflictMessage({ ...base,
kind: 'EVENT',
title: 'Feira' })).toBe('Sala ocupada: Evento "Feira" em 05/10 08:00–12:00');
        expect(conflictMessage({ ...base,
kind: 'MEETING',
title: 'Diretoria' })).toBe('Sala ocupada: Reunião "Diretoria" em 05/10 08:00–12:00');
    });

    it('mostra o dia do término quando é outro dia', () => {
        const o: RoomOccupant = { ...base,
kind: 'COURSE',
title: 'Curso longo',
endTime: new Date('2026-10-07T17:30:00.000Z') };
        expect(conflictMessage(o)).toBe('Sala ocupada: Curso "Curso longo" em 05/10 08:00–07/10 17:30');
    });
});

describe('findConflict', () => {
    const occupants: RoomOccupant[] = [
        { kind: 'COURSE',
id: 'c1',
title: 'A',
...slot('2026-10-05T08:00:00.000Z', '2026-10-05T12:00:00.000Z') },
        { kind: 'MEETING',
id: 'b1',
title: 'B',
...slot('2026-10-12T08:00:00.000Z', '2026-10-12T09:00:00.000Z') },
    ];

    it('devolve null quando nada sobrepõe', () => {
        expect(findConflict([slot('2026-10-05T12:00:00.000Z', '2026-10-05T13:00:00.000Z')], occupants)).toBeNull();
    });

    it('devolve o primeiro conflito na ordem das ocorrências', () => {
        const slots = [
            slot('2026-10-05T13:00:00.000Z', '2026-10-05T14:00:00.000Z'),
            slot('2026-10-12T08:30:00.000Z', '2026-10-12T10:00:00.000Z'),
        ];
        expect(findConflict(slots, occupants)?.id).toBe('b1');
    });
});

describe('generateOccurrences', () => {
    const first = slot('2026-10-05T08:00:00.000Z', '2026-10-05T10:00:00.000Z');

    it('sem repetição, só a própria', () => {
        expect(generateOccurrences(first).occurrences).toEqual([first]);
    });

    it('semanal até o dia final inclusive, mantendo a hora e a duração', () => {
        const r = generateOccurrences(first, { frequency: 'WEEKLY',
until: '2026-10-26' });
        expect(days(r.occurrences!)).toEqual(['2026-10-05T08:00', '2026-10-12T08:00', '2026-10-19T08:00', '2026-10-26T08:00']);
        expect(r.occurrences!.every(o => o.endTime.getTime() - o.startTime.getTime() === 2 * 60 * 60 * 1000)).toBe(true);
    });

    it('semanal com until no meio da semana para antes', () => {
        const r = generateOccurrences(first, { frequency: 'WEEKLY',
until: '2026-10-25' });
        expect(r.occurrences).toHaveLength(3);
    });

    it('mensal no mesmo dia do mês', () => {
        const r = generateOccurrences(slot('2026-01-15T19:00:00.000Z', '2026-01-15T21:00:00.000Z'), { frequency: 'MONTHLY',
until: '2026-04-15' });
        expect(days(r.occurrences!)).toEqual(['2026-01-15T19:00', '2026-02-15T19:00', '2026-03-15T19:00', '2026-04-15T19:00']);
    });

    it('mensal no dia 31 pula os meses sem esse dia', () => {
        const r = generateOccurrences(slot('2026-01-31T08:00:00.000Z', '2026-01-31T09:00:00.000Z'), { frequency: 'MONTHLY',
until: '2026-08-31' });
        expect(days(r.occurrences!)).toEqual([
            '2026-01-31T08:00',
            '2026-03-31T08:00',
            '2026-05-31T08:00',
            '2026-07-31T08:00',
            '2026-08-31T08:00',
        ]);
    });

    it('mensal no dia 29 inclui fevereiro só em ano bissexto', () => {
        const r = generateOccurrences(slot('2027-12-29T08:00:00.000Z', '2027-12-29T09:00:00.000Z'), { frequency: 'MONTHLY',
until: '2028-03-01' });
        expect(days(r.occurrences!)).toEqual(['2027-12-29T08:00', '2028-01-29T08:00', '2028-02-29T08:00']);
    });

    it(`aceita exatamente ${MAX_OCCURRENCES} ocorrências`, () => {
        // 05/10/2026 + 59 semanas = 22/11/2027
        const r = generateOccurrences(first, { frequency: 'WEEKLY',
until: '2027-11-22' });
        expect(r.error).toBeUndefined();
        expect(r.occurrences).toHaveLength(MAX_OCCURRENCES);
    });

    it(`recusa mais de ${MAX_OCCURRENCES} ocorrências`, () => {
        const r = generateOccurrences(first, { frequency: 'WEEKLY',
until: '2027-11-29' });
        expect(r.occurrences).toBeUndefined();
        expect(r.error?.message).toContain('60 ocorrências');
    });

    it('recusa repetição infinita sem travar (until muito distante)', () => {
        const r = generateOccurrences(first, { frequency: 'MONTHLY',
until: '9999-12-31' });
        expect(r.error?.message).toContain('60 ocorrências');
    });

    it('recusa until antes do início', () => {
        const r = generateOccurrences(first, { frequency: 'WEEKLY',
until: '2026-10-04' });
        expect(r.error?.message).toContain('terminar no dia do início ou depois');
    });

    it('recusa duração maior que o intervalo (ocorrências se sobreporiam)', () => {
        const long = slot('2026-10-05T08:00:00.000Z', '2026-10-13T08:00:00.000Z');
        const r = generateOccurrences(long, { frequency: 'WEEKLY',
until: '2026-10-20' });
        expect(r.error?.message).toContain('mais longa que o intervalo');
    });
});

describe('nowWallClock', () => {
    it('é o relógio de Brasília (UTC-3) rotulado em UTC', () => {
        expect(nowWallClock(new Date('2026-10-05T11:00:00.000Z')).toISOString()).toBe('2026-10-05T08:00:00.000Z');
    });
});
