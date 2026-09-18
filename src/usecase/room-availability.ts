// Ocupação das salas: cursos e reservas (eventos/reuniões) dividem a mesma agenda.
// Todos os horários são hora "de parede" de Brasília rotulada em UTC (como o
// painel grava os cursos), então os campos UTC já são o relógio de Terra Roxa.
import { ValidationError } from '../errors/validation.js';
import type { RoomOccupant, RoomOccupantKind } from '../ports/external/room-booking-repository.js';

export type { RoomOccupant, RoomOccupantKind };

export type TimeSlot = {
    startTime: Date;
    endTime: Date;
};

export type RepeatRule = {
    frequency: 'WEEKLY' | 'MONTHLY';
    /** Último dia (inclusive), "AAAA-MM-DD". */
    until: string;
};

export const MAX_OCCURRENCES = 60;

export const OCCUPANT_KIND_LABEL: Record<RoomOccupantKind, string> = {
    COURSE: 'Curso',
    EVENT: 'Evento',
    MEETING: 'Reunião',
};

// Brasília é UTC-3 fixo (sem horário de verão desde 2019).
const BRASILIA_OFFSET_MS = 3 * 60 * 60 * 1000;

/** "Agora" no mesmo formato dos horários gravados (relógio de Brasília com Z). */
export function nowWallClock(now: Date = new Date()): Date {
    return new Date(now.getTime() - BRASILIA_OFFSET_MS);
}

/** Sobreposição estrita: encostar (um termina quando o outro começa) é permitido. */
export function overlaps(a: TimeSlot, b: TimeSlot): boolean {
    return a.startTime.getTime() < b.endTime.getTime() && a.endTime.getTime() > b.startTime.getTime();
}

/** Primeiro ocupante (na ordem recebida) que sobrepõe algum dos horários. */
export function findConflict(slots: TimeSlot[], occupants: RoomOccupant[]): RoomOccupant | null {
    for (const slot of slots) {
        const hit = occupants.find(o => overlaps(slot, o));
        if (hit) return hit;
    }
    return null;
}

const pad = (n: number) => String(n).padStart(2, '0');
const dayMonth = (d: Date) => `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}`;
const hourMinute = (d: Date) => `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;

/** 'Sala ocupada: Curso "X" em 05/10 08:00–12:00' (dia do término só quando muda). */
export function conflictMessage(o: RoomOccupant): string {
    const sameDay = o.startTime.toISOString().slice(0, 10) === o.endTime.toISOString().slice(0, 10);
    const end = sameDay ? hourMinute(o.endTime) : `${dayMonth(o.endTime)} ${hourMinute(o.endTime)}`;
    return `Sala ocupada: ${OCCUPANT_KIND_LABEL[o.kind]} "${o.title}" em ${dayMonth(o.startTime)} ${hourMinute(o.startTime)}–${end}`;
}

/** Menor início e maior término de uma lista não vazia de horários. */
export function slotsRange(slots: TimeSlot[]): TimeSlot {
    return {
        startTime: new Date(Math.min(...slots.map(s => s.startTime.getTime()))),
        endTime: new Date(Math.max(...slots.map(s => s.endTime.getTime()))),
    };
}

/**
 * Ocorrências de uma reserva. Sem repetição, só a própria. Semanal: a cada 7
 * dias; mensal: mesmo dia do mês (mês sem esse dia, ex. 31, é pulado). Vai até
 * o dia `until` inclusive, no máximo MAX_OCCURRENCES.
 */
export function generateOccurrences(
    first: TimeSlot,
    repeat?: RepeatRule | null,
): {
 error?: ValidationError;
occurrences?: TimeSlot[] 
} {
    if (!repeat) return { occurrences: [first] };

    const firstDay = first.startTime.toISOString().slice(0, 10);
    if (repeat.until < firstDay) {
        return { error: new ValidationError('A repetição precisa terminar no dia do início ou depois.') };
    }

    const duration = first.endTime.getTime() - first.startTime.getTime();
    const occurrences: TimeSlot[] = [];
    const s = first.startTime;
    const push = (start: Date) => occurrences.push({ startTime: start,
        endTime: new Date(start.getTime() + duration) });

    for (let k = 0; ; k++) {
        let start: Date;
        if (repeat.frequency === 'WEEKLY') {
            start = new Date(s.getTime() + k * 7 * 24 * 60 * 60 * 1000);
        } else {
            start = new Date(Date.UTC(
                s.getUTCFullYear(),
                s.getUTCMonth() + k,
                s.getUTCDate(),
                s.getUTCHours(),
                s.getUTCMinutes(),
                s.getUTCSeconds(),
                s.getUTCMilliseconds(),
            ));
            // Date.UTC "transborda" o dia 31 para o mês seguinte: esse mês não tem o dia.
            if (start.getUTCDate() !== s.getUTCDate()) {
                // Ainda precisa parar quando o mês alvo passou de `until`.
                const monthStart = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth() + k, 1));
                if (monthStart.toISOString().slice(0, 10) > repeat.until) break;
                continue;
            }
        }
        if (start.toISOString().slice(0, 10) > repeat.until) break;
        if (occurrences.length >= MAX_OCCURRENCES) {
            return {
                error: new ValidationError(`A repetição passa de ${MAX_OCCURRENCES} ocorrências. Escolha uma data final mais próxima.`),
            };
        }
        push(start);
    }

    // Duração maior que o intervalo: as próprias ocorrências se sobreporiam.
    for (let i = 1; i < occurrences.length; i++) {
        if (overlaps(occurrences[i - 1], occurrences[i])) {
            return { error: new ValidationError('A reserva é mais longa que o intervalo da repetição.') };
        }
    }
    return { occurrences };
}
