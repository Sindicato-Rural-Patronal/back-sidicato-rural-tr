import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type {
    RoomBookingCreateData,
    RoomBookingItem,
    RoomBookingRepository,
    RoomBookingUpdateData,
    RoomScheduleItem,
    PublicEventItem,
    BookingType,
} from '../ports/external/room-booking-repository.js';
import { ValidationError } from '../errors/validation.js';
import { RoomBookingNotFoundError, RoomNotFoundError, UserDataNotFoundError } from '../errors/not-found.js';
import { RoomAlreadyBookedError } from '../errors/business-rule.js';
import { conflictMessage, findConflict, generateOccurrences, nowWallClock } from './room-availability.js';

// Reservas de sala: eventos e reuniões que ocupam as salas além dos cursos.
// Horários em hora "de parede" de Brasília rotulada em UTC (igual aos cursos).

type Result<T> = { error?: Error } & T;

const DAY_MS = 24 * 60 * 60 * 1000;
/** Maior período aceito na listagem e na agenda. */
export const MAX_RANGE_DAYS = 370;

const firstIssue = (e: z.ZodError) => e.issues[0]?.message ?? 'Dados inválidos';
const blankToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);
const blankToUndefined = (v: unknown) => (v === '' || v == null ? undefined : v);

/** "AAAA-MM-DD" que existe no calendário. */
const ymd = z
    .string({ message: 'Data inválida: use AAAA-MM-DD' })
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida: use AAAA-MM-DD')
    .refine(s => !Number.isNaN(Date.parse(`${s}T00:00:00.000Z`)) && new Date(`${s}T00:00:00.000Z`).toISOString().startsWith(s), 'Data inválida');

const bookingType = z.enum(['EVENT', 'MEETING'], { message: 'Tipo inválido: use EVENT (evento) ou MEETING (reunião)' });
const title = z
    .string({ message: 'Informe o título' })
    .trim()
    .min(1, 'Informe o título')
    .max(150, 'Título muito longo (máximo de 150 caracteres)');
const description = z.preprocess(blankToNull, z.string().trim().max(2000, 'Descrição muito longa').nullable().optional());
const publicDescription = z.preprocess(
    blankToNull,
    z.string().trim().max(2000, 'Descrição pública muito longa').nullable().optional(),
);
const publicOnSite = z.boolean().optional();
const responsibleName = z.preprocess(blankToNull, z.string().trim().max(150, 'Nome do responsável muito longo').nullable().optional());
const responsibleUserDataId = z.preprocess(blankToNull, z.string().trim().max(64).nullable().optional());
const roomId = z.string({ message: 'Escolha a sala' }).trim().min(1, 'Escolha a sala').max(64);
const dateTime = (label: string) => z.iso.datetime({ message: `${label} inválido: use data e hora ISO (AAAA-MM-DDTHH:MM:00.000Z)` });

const rangeSchema = z.object({
    from: z.preprocess(blankToUndefined, ymd.optional()),
    to: z.preprocess(blankToUndefined, ymd.optional()),
    roomId: z.preprocess(blankToUndefined, z.string().trim().max(64).optional()),
});

const listSchema = rangeSchema.extend({
    type: z.preprocess(blankToUndefined, bookingType.optional()),
    search: z.preprocess(blankToUndefined, z.string().trim().max(200).optional()),
});

const createSchema = z.object({
    type: bookingType,
    title,
    description,
    publicOnSite,
    publicDescription,
    roomId,
    startTime: dateTime('Início'),
    endTime: dateTime('Término'),
    responsibleUserDataId,
    responsibleName,
    repeat: z
        .object({
            frequency: z.enum(['WEEKLY', 'MONTHLY'], { message: 'Repetição inválida: use WEEKLY ou MONTHLY' }),
            until: ymd,
        })
        .nullable()
        .optional(),
});

const updateSchema = z.object({
    type: bookingType.optional(),
    title: title.optional(),
    description,
    publicOnSite,
    publicDescription,
    roomId: roomId.optional(),
    startTime: dateTime('Início').optional(),
    endTime: dateTime('Término').optional(),
    responsibleUserDataId,
    responsibleName,
});

/**
 * Período [from 00:00, to + 1 dia 00:00) a partir de dias "AAAA-MM-DD".
 * Os dois são obrigatórios na listagem e na agenda.
 */
export function parseDayRange(from: string | undefined, to: string | undefined): Result<{
 range?: {
 from: Date;
to: Date 
} 
}> {
    if (!from || !to) return { error: new ValidationError('Informe o período: from e to (AAAA-MM-DD)') };
    if (to < from) return { error: new ValidationError('A data final precisa ser igual ou depois da inicial') };
    const start = new Date(`${from}T00:00:00.000Z`);
    const lastDay = new Date(`${to}T00:00:00.000Z`);
    if ((lastDay.getTime() - start.getTime()) / DAY_MS > MAX_RANGE_DAYS) {
        return { error: new ValidationError(`Período máximo de ${MAX_RANGE_DAYS} dias`) };
    }
    return { range: { from: start,
to: new Date(lastDay.getTime() + DAY_MS) } };
}

/**
 * Só evento vai para o site: virar reunião tira a publicação. Sem `requested`,
 * mantém o que já estava (`current`).
 */
export function effectivePublicOnSite(
    type: BookingType,
    requested: boolean | undefined,
    current = false,
): boolean {
    return type === 'EVENT' ? (requested ?? current) : false;
}

/** Quantos eventos a página pública mostra de uma vez. */
export const PUBLIC_EVENTS_LIMIT = 50;

export class ListPublicEventsUseCase {
    constructor(private readonly repo: RoomBookingRepository) {}

    /** Eventos publicados que ainda não terminaram, do mais próximo em diante. */
    async execute(now: Date = new Date()): Promise<{ events: PublicEventItem[] }> {
        return { events: await this.repo.listPublicEvents(nowWallClock(now), PUBLIC_EVENTS_LIMIT) };
    }
}

export class ListRoomBookingsUseCase {
    constructor(private readonly repo: RoomBookingRepository) {}

    async execute(query: unknown): Promise<Result<{ bookings?: RoomBookingItem[] }>> {
        const parsed = listSchema.safeParse(query ?? {});
        if (!parsed.success) return { error: new ValidationError(firstIssue(parsed.error)) };
        const { from, to, ...filters } = parsed.data;
        const r = parseDayRange(from, to);
        if (r.error) return { error: r.error };
        return { bookings: await this.repo.list({ ...filters,
...r.range }) };
    }
}

export class GetRoomScheduleUseCase {
    constructor(private readonly repo: RoomBookingRepository) {}

    async execute(query: unknown): Promise<Result<{ items?: RoomScheduleItem[] }>> {
        const parsed = rangeSchema.safeParse(query ?? {});
        if (!parsed.success) return { error: new ValidationError(firstIssue(parsed.error)) };
        const r = parseDayRange(parsed.data.from, parsed.data.to);
        if (r.error || !r.range) return { error: r.error };
        return { items: await this.repo.schedule({ ...r.range,
roomId: parsed.data.roomId }) };
    }
}

export class CreateRoomBookingUseCase {
    constructor(private readonly repo: RoomBookingRepository) {}

    async execute(input: unknown): Promise<Result<{
 ids?: string[];
seriesId?: string | null 
}>> {
        const parsed = createSchema.safeParse(input);
        if (!parsed.success) return { error: new ValidationError(firstIssue(parsed.error)) };
        const data = parsed.data;

        const first = { startTime: new Date(data.startTime),
endTime: new Date(data.endTime) };
        if (first.endTime <= first.startTime) {
            return { error: new ValidationError('O término precisa ser depois do início') };
        }
        const generated = generateOccurrences(first, data.repeat);
        if (generated.error || !generated.occurrences) return { error: generated.error };
        const occurrences = generated.occurrences;

        if (!(await this.repo.roomExists(data.roomId))) return { error: new RoomNotFoundError() };
        if (data.responsibleUserDataId && !(await this.repo.personExists(data.responsibleUserDataId))) {
            return { error: new UserDataNotFoundError() };
        }

        // Série só quando a repetição gerou mais de uma ocorrência.
        const seriesId = occurrences.length > 1 ? randomUUID() : null;
        const showOnSite = effectivePublicOnSite(data.type, data.publicOnSite);
        const rows: RoomBookingCreateData[] = occurrences.map(slot => ({
            type: data.type,
            title: data.title,
            description: data.description ?? null,
            publicOnSite: showOnSite,
            publicDescription: showOnSite ? (data.publicDescription ?? null) : null,
            roomId: data.roomId,
            startTime: slot.startTime,
            endTime: slot.endTime,
            responsibleUserDataId: data.responsibleUserDataId ?? null,
            responsibleName: data.responsibleName ?? null,
            seriesId,
        }));

        // Todas as ocorrências são checadas antes; qualquer conflito cancela tudo.
        const written = await this.repo.createMany(rows, occupants => findConflict(occurrences, occupants));
        if ('conflict' in written) return { error: new RoomAlreadyBookedError(conflictMessage(written.conflict)) };
        return { ids: written.result,
seriesId };
    }
}

export class UpdateRoomBookingUseCase {
    constructor(private readonly repo: RoomBookingRepository) {}

    async execute(id: string, input: unknown): Promise<Result<{ booking?: RoomBookingItem }>> {
        const parsed = updateSchema.safeParse(input ?? {});
        if (!parsed.success) return { error: new ValidationError(firstIssue(parsed.error)) };
        const existing = await this.repo.findById(id);
        if (!existing) return { error: new RoomBookingNotFoundError() };
        const data = parsed.data;

        const slot = {
            roomId: data.roomId ?? existing.roomId,
            startTime: data.startTime ? new Date(data.startTime) : existing.startTime,
            endTime: data.endTime ? new Date(data.endTime) : existing.endTime,
        };
        if (slot.endTime <= slot.startTime) {
            return { error: new ValidationError('O término precisa ser depois do início') };
        }
        const moved =
            slot.roomId !== existing.roomId ||
            slot.startTime.getTime() !== existing.startTime.getTime() ||
            slot.endTime.getTime() !== existing.endTime.getTime();

        if (slot.roomId !== existing.roomId && !(await this.repo.roomExists(slot.roomId))) {
            return { error: new RoomNotFoundError() };
        }
        if (
            data.responsibleUserDataId &&
            data.responsibleUserDataId !== existing.responsible?.id &&
            !(await this.repo.personExists(data.responsibleUserDataId))
        ) {
            return { error: new UserDataNotFoundError() };
        }

        // Virar reunião tira do site; evento mantém/muda conforme o corpo.
        const showOnSite = effectivePublicOnSite(
            data.type ?? existing.type,
            data.publicOnSite,
            existing.publicOnSite,
        );

        // Só o que veio no corpo (null limpa descrição/responsável).
        const changes: RoomBookingUpdateData = {
            ...(data.type !== undefined && { type: data.type }),
            ...(showOnSite !== existing.publicOnSite && { publicOnSite: showOnSite }),
            ...(!showOnSite && existing.publicDescription !== null && { publicDescription: null }),
            ...(showOnSite &&
                data.publicDescription !== undefined && { publicDescription: data.publicDescription }),
            ...(data.title !== undefined && { title: data.title }),
            ...(data.description !== undefined && { description: data.description }),
            ...(data.roomId !== undefined && { roomId: slot.roomId }),
            ...(data.startTime !== undefined && { startTime: slot.startTime }),
            ...(data.endTime !== undefined && { endTime: slot.endTime }),
            ...(data.responsibleUserDataId !== undefined && { responsibleUserDataId: data.responsibleUserDataId }),
            ...(data.responsibleName !== undefined && { responsibleName: data.responsibleName }),
        };

        // Muda só esta ocorrência; conflito checado sem contar ela mesma.
        const written = await this.repo.update(id, changes, slot, moved ? occupants => findConflict([slot], occupants) : null);
        if ('conflict' in written) return { error: new RoomAlreadyBookedError(conflictMessage(written.conflict)) };
        return { booking: written.result };
    }
}

export class DeleteRoomBookingUseCase {
    constructor(private readonly repo: RoomBookingRepository) {}

    async execute(id: string, scope: unknown): Promise<Result<{ deleted?: number }>> {
        const s = scope === undefined || scope === '' ? 'one' : scope;
        if (s !== 'one' && s !== 'future') {
            return { error: new ValidationError('scope inválido: use one ou future') };
        }
        const existing = await this.repo.findById(id);
        if (!existing) return { error: new RoomBookingNotFoundError() };
        return { deleted: await this.repo.softDelete(existing, s) };
    }
}
