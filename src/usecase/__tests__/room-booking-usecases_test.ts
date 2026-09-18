import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    CreateRoomBookingUseCase,
    DeleteRoomBookingUseCase,
    GetRoomScheduleUseCase,
    ListRoomBookingsUseCase,
    UpdateRoomBookingUseCase,
    parseDayRange,
} from '../room-booking-usecases.js';
import { DeleteRoomUseCase } from '../delete-room.js';
import type {
    ConflictGuard,
    RoomBookingCreateData,
    RoomBookingItem,
    RoomBookingRepository,
    RoomOccupant,
} from '../../ports/external/room-booking-repository.js';
import type { RoomRepository } from '../../ports/external/room-repository.js';
import { RoomAlreadyBookedError } from '../../errors/business-rule.js';
import { NotFoundError } from '../../errors/not-found.js';
import { ValidationError } from '../../errors/validation.js';

const ROOM = 'room-1';

function makeRepo(occupants: RoomOccupant[] = []) {
    const repo = {
        list: vi.fn().mockResolvedValue([]),
        listPublicEvents: vi.fn().mockResolvedValue([]),
        schedule: vi.fn().mockResolvedValue([]),
        findById: vi.fn(),
        occupants: vi.fn(),
        // Simula a transação: passa os ocupantes pelo guard antes de "gravar".
        createMany: vi.fn(async (rows: RoomBookingCreateData[], guard: ConflictGuard) => {
            const conflict = guard(occupants);
            return conflict ? { conflict } : { result: rows.map((_, i) => `id-${i}`) };
        }),
        update: vi.fn(async (id: string, data: object, _slot: unknown, guard: ConflictGuard | null) => {
            const conflict = guard?.(occupants) ?? null;
            return conflict ? { conflict } : { result: { ...BOOKING,
...data,
id } };
        }),
        softDelete: vi.fn().mockResolvedValue(1),
        personExists: vi.fn().mockResolvedValue(true),
        roomExists: vi.fn().mockResolvedValue(true),
    };
    return repo as typeof repo & RoomBookingRepository;
}

const BOOKING: RoomBookingItem = {
    id: 'b-1',
    type: 'MEETING',
    title: 'Diretoria',
    description: null,
    publicOnSite: false,
    publicDescription: null,
    roomId: ROOM,
    roomName: 'SALA 1',
    startTime: new Date('2026-10-05T08:00:00.000Z'),
    endTime: new Date('2026-10-05T10:00:00.000Z'),
    responsible: null,
    responsibleName: null,
    seriesId: 'serie-1',
};

const input = {
    type: 'MEETING',
    title: '  Reunião da diretoria  ',
    roomId: ROOM,
    startTime: '2026-10-05T08:00:00.000Z',
    endTime: '2026-10-05T10:00:00.000Z',
};

describe('parseDayRange', () => {
    it('vira [from 00:00, to + 1 dia 00:00)', () => {
        const r = parseDayRange('2026-10-01', '2026-10-31');
        expect(r.range?.from.toISOString()).toBe('2026-10-01T00:00:00.000Z');
        expect(r.range?.to.toISOString()).toBe('2026-11-01T00:00:00.000Z');
    });

    it('exige os dois, to >= from e no máximo 370 dias', () => {
        expect(parseDayRange(undefined, '2026-10-01').error).toBeInstanceOf(ValidationError);
        expect(parseDayRange('2026-10-02', '2026-10-01').error).toBeInstanceOf(ValidationError);
        expect(parseDayRange('2026-01-01', '2027-01-06').error).toBeUndefined();
        expect(parseDayRange('2026-01-01', '2027-01-07').error?.message).toContain('370');
    });
});

describe('ListRoomBookingsUseCase / GetRoomScheduleUseCase', () => {
    it('lista com período e filtros', async () => {
        const repo = makeRepo();
        const r = await new ListRoomBookingsUseCase(repo).execute({ from: '2026-10-01',
to: '2026-10-31',
type: 'EVENT',
search: 'feira' });
        expect(r.error).toBeUndefined();
        expect(repo.list).toHaveBeenCalledWith(expect.objectContaining({ type: 'EVENT',
search: 'feira',
from: new Date('2026-10-01T00:00:00.000Z') }));
    });

    it('recusa data inválida e tipo inválido', async () => {
        const repo = makeRepo();
        expect((await new ListRoomBookingsUseCase(repo).execute({ from: '2026-02-30',
to: '2026-03-01' })).error).toBeInstanceOf(ValidationError);
        expect((await new ListRoomBookingsUseCase(repo).execute({ from: '2026-02-01',
to: '2026-03-01',
type: 'X' })).error).toBeInstanceOf(ValidationError);
    });

    it('agenda sem período → 400', async () => {
        const r = await new GetRoomScheduleUseCase(makeRepo()).execute({});
        expect(r.error).toBeInstanceOf(ValidationError);
    });
});

describe('CreateRoomBookingUseCase', () => {
    beforeEach(() => vi.clearAllMocks());

    it('cria uma reserva sem série, com título aparado', async () => {
        const repo = makeRepo();
        const r = await new CreateRoomBookingUseCase(repo).execute(input);
        expect(r.error).toBeUndefined();
        expect(r).toMatchObject({ ids: ['id-0'],
seriesId: null });
        expect(repo.createMany.mock.calls[0][0][0]).toMatchObject({ title: 'Reunião da diretoria',
description: null,
seriesId: null });
    });

    it('repetição semanal cria N ocorrências com o mesmo seriesId', async () => {
        const repo = makeRepo();
        const r = await new CreateRoomBookingUseCase(repo).execute({ ...input,
repeat: { frequency: 'WEEKLY',
until: '2026-10-26' } });
        expect(r.ids).toHaveLength(4);
        expect(r.seriesId).toBeTruthy();
        const rows = repo.createMany.mock.calls[0][0];
        expect(new Set(rows.map(x => x.seriesId))).toEqual(new Set([r.seriesId]));
    });

    it('término antes do início → 400', async () => {
        const r = await new CreateRoomBookingUseCase(makeRepo()).execute({ ...input,
endTime: input.startTime });
        expect(r.error?.message).toBe('O término precisa ser depois do início');
    });

    it('título vazio ou longo → 400', async () => {
        expect((await new CreateRoomBookingUseCase(makeRepo()).execute({ ...input,
title: '   ' })).error?.message).toBe('Informe o título');
        expect((await new CreateRoomBookingUseCase(makeRepo()).execute({ ...input,
title: 'x'.repeat(151) })).error).toBeInstanceOf(ValidationError);
    });

    it('sala ou responsável inexistente → 404', async () => {
        const noRoom = makeRepo();
        noRoom.roomExists.mockResolvedValue(false);
        expect((await new CreateRoomBookingUseCase(noRoom).execute(input)).error).toBeInstanceOf(NotFoundError);
        const noPerson = makeRepo();
        noPerson.personExists.mockResolvedValue(false);
        expect((await new CreateRoomBookingUseCase(noPerson).execute({ ...input,
responsibleUserDataId: 'p-x' })).error).toBeInstanceOf(NotFoundError);
    });

    it('conflito em qualquer ocorrência → 409 com a mensagem do primeiro conflito', async () => {
        const course: RoomOccupant = {
            kind: 'COURSE',
            id: 'c-1',
            title: 'Irrigação',
            startTime: new Date('2026-10-19T09:00:00.000Z'),
            endTime: new Date('2026-10-19T12:00:00.000Z'),
        };
        const repo = makeRepo([course]);
        const r = await new CreateRoomBookingUseCase(repo).execute({ ...input,
repeat: { frequency: 'WEEKLY',
until: '2026-10-26' } });
        expect(r.error).toBeInstanceOf(RoomAlreadyBookedError);
        expect(r.error?.message).toBe('Sala ocupada: Curso "Irrigação" em 19/10 09:00–12:00');
        expect(r.ids).toBeUndefined();
    });

    it('mais de 60 ocorrências → 400 sem tocar no banco', async () => {
        const repo = makeRepo();
        const r = await new CreateRoomBookingUseCase(repo).execute({ ...input,
repeat: { frequency: 'WEEKLY',
until: '2028-12-31' } });
        expect(r.error).toBeInstanceOf(ValidationError);
        expect(repo.createMany).not.toHaveBeenCalled();
    });
});

describe('UpdateRoomBookingUseCase', () => {
    it('mudar só o título não checa conflito', async () => {
        const repo = makeRepo();
        repo.findById.mockResolvedValue(BOOKING);
        const r = await new UpdateRoomBookingUseCase(repo).execute('b-1', { title: 'Nova' });
        expect(r.booking?.title).toBe('Nova');
        expect(repo.update.mock.calls[0][3]).toBeNull();
    });

    it('mudar horário checa conflito (sem contar ela mesma) → 409', async () => {
        const other: RoomOccupant = {
            kind: 'EVENT',
            id: 'b-2',
            title: 'Feira',
            startTime: new Date('2026-10-05T10:00:00.000Z'),
            endTime: new Date('2026-10-05T11:00:00.000Z'),
        };
        const repo = makeRepo([other]);
        repo.findById.mockResolvedValue(BOOKING);
        const r = await new UpdateRoomBookingUseCase(repo).execute('b-1', { endTime: '2026-10-05T10:30:00.000Z' });
        expect(r.error?.message).toBe('Sala ocupada: Evento "Feira" em 05/10 10:00–11:00');
    });

    it('null limpa descrição e responsável', async () => {
        const repo = makeRepo();
        repo.findById.mockResolvedValue(BOOKING);
        await new UpdateRoomBookingUseCase(repo).execute('b-1', { description: null,
responsibleUserDataId: null,
responsibleName: '' });
        expect(repo.update.mock.calls[0][1]).toEqual({ description: null,
responsibleUserDataId: null,
responsibleName: null });
    });

    it('inexistente → 404; término antes do início → 400', async () => {
        const repo = makeRepo();
        repo.findById.mockResolvedValue(null);
        expect((await new UpdateRoomBookingUseCase(repo).execute('x', {})).error).toBeInstanceOf(NotFoundError);
        repo.findById.mockResolvedValue(BOOKING);
        expect((await new UpdateRoomBookingUseCase(repo).execute('b-1', { endTime: '2026-10-05T07:00:00.000Z' })).error).toBeInstanceOf(ValidationError);
    });
});

describe('DeleteRoomBookingUseCase', () => {
    it('scope padrão one; future repassado; inválido → 400', async () => {
        const repo = makeRepo();
        repo.findById.mockResolvedValue(BOOKING);
        const uc = new DeleteRoomBookingUseCase(repo);
        expect(await uc.execute('b-1', undefined)).toEqual({ deleted: 1 });
        expect(repo.softDelete).toHaveBeenLastCalledWith(BOOKING, 'one');
        await uc.execute('b-1', 'future');
        expect(repo.softDelete).toHaveBeenLastCalledWith(BOOKING, 'future');
        expect((await uc.execute('b-1', 'all')).error).toBeInstanceOf(ValidationError);
    });
});

describe('DeleteRoomUseCase com reservas', () => {
    it('recusa sala com reserva futura, contando a partir do relógio de Brasília', async () => {
        const rooms = {
            findById: vi.fn().mockResolvedValue({ id: ROOM }),
            countCourses: vi.fn().mockResolvedValue(0),
            countFutureBookings: vi.fn().mockResolvedValue(1),
            delete: vi.fn(),
        } as unknown as RoomRepository;
        const r = await new DeleteRoomUseCase(rooms, () => new Date('2026-10-05T11:00:00.000Z')).execute(ROOM);
        expect(r.error?.name).toBe('RoomHasBookingsError');
        expect(rooms.countFutureBookings).toHaveBeenCalledWith(ROOM, new Date('2026-10-05T08:00:00.000Z'));
        expect(rooms.delete).not.toHaveBeenCalled();
    });
});
