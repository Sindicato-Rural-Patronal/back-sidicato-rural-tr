import type { CourseWithDetails } from '../ports/external/course-repository.js';
import {
    BusinessRuleError,
    RegistrationsUnavailableError,
    RegistrationDeadlinePassedError,
    CourseFullError,
} from '../errors/business-rule.js';
import { todayInBrazil } from './quote-products.js';

export class CourseEndedError extends BusinessRuleError {
    constructor() {
        super('Este curso já terminou e não aceita mais inscrições.');
        this.name = 'CourseEndedError';
    }
}

/**
 * Dia ("AAAA-MM-DD") de uma data do curso. O painel grava a hora "de parede"
 * rotulada em UTC (…Z), então a parte da data do ISO já é o dia em Brasília.
 */
export function courseDay(date: Date): string {
    return date.toISOString().slice(0, 10);
}

/** Hoje em Brasília, "AAAA-MM-DD". */
function todayDay(now: Date): string {
    return todayInBrazil(now).toISOString().slice(0, 10);
}

// Brasília é UTC-3 fixo (sem horário de verão desde 2019).
const BRASILIA_OFFSET_MS = 3 * 60 * 60 * 1000;

/**
 * Hora do prazo ("HH:MM") como o painel gravou, ou null quando é 00:00 —
 * o painel grava 00:00 quando ninguém informou a hora.
 */
export function deadlineTime(deadline: Date | null): string | null {
    if (!deadline) return null;
    const hm = deadline.toISOString().slice(11, 16);
    return hm === '00:00' ? null : hm;
}

/**
 * Prazo de inscrição, no horário de Brasília:
 * - sem hora (00:00): vale até o fim do dia do prazo;
 * - com hora: fecha quando o relógio de Brasília passa de dia + hora.
 */
export function isRegistrationDeadlinePassed(deadline: Date | null, now: Date = new Date()): boolean {
    if (!deadline) return false;
    if (deadlineTime(deadline) === null) return courseDay(deadline) < todayDay(now);
    // O prazo é hora "de parede" com Z; "agora" em Brasília no mesmo formato.
    return now.getTime() - BRASILIA_OFFSET_MS > deadline.getTime();
}

/** O curso terminou quando o dia do fim (Brasília) já passou — no próprio dia ainda vale. */
export function hasCourseEnded(endTime: Date, now: Date = new Date()): boolean {
    return courseDay(endTime) < todayDay(now);
}

/**
 * Regras de negócio para aceitar uma inscrição num curso:
 * - status precisa aceitar inscrições (não UNPUBLISHED nem IN_PROGRESS)
 * - o curso não pode ter terminado: concluído pela equipe (COMPLETED) ou dia do fim já passou em Brasília
 * - o prazo (registrationDeadline) em Brasília: até o fim do dia, ou até a hora quando o painel informou uma
 * - não pode exceder a capacidade da sala (room.maxCapacity)
 *
 * Retorna o erro correspondente ou `null` se pode inscrever.
 */
export function checkCourseAcceptsRegistration(
    course: CourseWithDetails,
    now: Date = new Date(),
): Error | null {
    if (course.status === 'UNPUBLISHED' || course.status === 'IN_PROGRESS') {
        return new RegistrationsUnavailableError();
    }
    if (course.status === 'COMPLETED' || hasCourseEnded(course.endTime, now)) {
        return new CourseEndedError();
    }
    if (isRegistrationDeadlinePassed(course.registrationDeadline, now)) {
        return new RegistrationDeadlinePassedError();
    }
    if (course._count.courseUserRegistration >= course.room.maxCapacity) {
        return new CourseFullError();
    }
    return null;
}
