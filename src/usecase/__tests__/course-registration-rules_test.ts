import { describe, it, expect } from 'vitest';
import {
    checkCourseAcceptsRegistration,
    CourseEndedError,
    deadlineTime,
    hasCourseEnded,
    isRegistrationDeadlinePassed,
} from '../../lib/course-registration-rules.js';
import {
    CourseFullError,
    RegistrationDeadlinePassedError,
    RegistrationsUnavailableError,
} from '../../errors/business-rule.js';
import type { CourseWithDetails } from '../../ports/external/course-repository.js';

// O painel grava a hora "de parede" com Z: prazo 20/09 sem hora = 2026-09-20T00:00Z.
const deadline = new Date('2026-09-20T00:00:00.000Z');
// 20/09 23:30 em Brasília = 21/09 02:30 UTC.
const deadlineDayLate = new Date('2026-09-21T02:30:00.000Z');
// 21/09 00:01 em Brasília = 21/09 03:01 UTC.
const nextDayEarly = new Date('2026-09-21T03:01:00.000Z');

function course(overrides: Partial<CourseWithDetails> = {}): CourseWithDetails {
    return {
        status: 'PUBLIC',
        startTime: new Date('2026-09-25T08:00:00.000Z'),
        endTime: new Date('2026-09-26T17:00:00.000Z'),
        registrationDeadline: deadline,
        room: { name: 'AUDITORIO',
maxCapacity: 10 },
        _count: { courseUserRegistration: 0 },
        ...overrides,
    } as CourseWithDetails;
}

describe('prazo sem hora (dia inteiro em Brasília)', () => {
    it('continua aberto às 23:30 do dia do prazo', () => {
        expect(isRegistrationDeadlinePassed(deadline, deadlineDayLate)).toBe(false);
        expect(checkCourseAcceptsRegistration(course(), deadlineDayLate)).toBeNull();
    });

    it('fecha às 00:01 do dia seguinte', () => {
        expect(isRegistrationDeadlinePassed(deadline, nextDayEarly)).toBe(true);
        expect(checkCourseAcceptsRegistration(course(), nextDayEarly)).toBeInstanceOf(
            RegistrationDeadlinePassedError,
        );
    });

    it('prazo sem hora (00:00) não tem hora para exibir', () => {
        expect(deadlineTime(deadline)).toBeNull();
        expect(deadlineTime(null)).toBeNull();
    });

    it('sem prazo nunca fecha por prazo', () => {
        expect(isRegistrationDeadlinePassed(null, nextDayEarly)).toBe(false);
    });
});

describe('prazo com hora (relógio de Brasília)', () => {
    // Painel gravou 20/09 às 18:00 (hora "de parede" com Z).
    const at18 = new Date('2026-09-20T18:00:00.000Z');
    // 17:59 e 18:01 em Brasília = 20:59 e 21:01 UTC.
    const at1759 = new Date('2026-09-20T20:59:00.000Z');
    const at1801 = new Date('2026-09-20T21:01:00.000Z');

    it('expõe a hora informada', () => {
        expect(deadlineTime(at18)).toBe('18:00');
    });

    it('aberto às 17:59', () => {
        expect(isRegistrationDeadlinePassed(at18, at1759)).toBe(false);
        expect(checkCourseAcceptsRegistration(course({ registrationDeadline: at18 }), at1759)).toBeNull();
    });

    it('fechado às 18:01', () => {
        expect(isRegistrationDeadlinePassed(at18, at1801)).toBe(true);
        expect(checkCourseAcceptsRegistration(course({ registrationDeadline: at18 }), at1801)).toBeInstanceOf(
            RegistrationDeadlinePassedError,
        );
    });
});

describe('fim do curso (dia em Brasília)', () => {
    const endTime = new Date('2026-09-20T17:00:00.000Z');

    it('ainda aceita no último dia do curso', () => {
        expect(hasCourseEnded(endTime, deadlineDayLate)).toBe(false);
    });

    it('recusa a partir do dia seguinte ao fim', () => {
        expect(hasCourseEnded(endTime, nextDayEarly)).toBe(true);
        const c = course({ endTime,
registrationDeadline: null });
        expect(checkCourseAcceptsRegistration(c, nextDayEarly)).toBeInstanceOf(CourseEndedError);
    });

    it('curso terminado responde "terminou" mesmo com o prazo vencido', () => {
        const c = course({ endTime });
        expect(checkCourseAcceptsRegistration(c, nextDayEarly)).toBeInstanceOf(CourseEndedError);
    });
});

describe('demais regras', () => {
    it('status IN_PROGRESS e UNPUBLISHED não aceitam inscrição', () => {
        expect(checkCourseAcceptsRegistration(course({ status: 'IN_PROGRESS' }), deadlineDayLate)).toBeInstanceOf(
            RegistrationsUnavailableError,
        );
        expect(checkCourseAcceptsRegistration(course({ status: 'UNPUBLISHED' }), deadlineDayLate)).toBeInstanceOf(
            RegistrationsUnavailableError,
        );
    });

    it('curso lotado', () => {
        const c = course({ _count: { courseUserRegistration: 10 } } as Partial<CourseWithDetails>);
        expect(checkCourseAcceptsRegistration(c, deadlineDayLate)).toBeInstanceOf(CourseFullError);
    });
});
