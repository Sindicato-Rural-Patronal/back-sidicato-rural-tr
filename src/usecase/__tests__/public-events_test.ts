import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    CreateRoomBookingUseCase,
    ListPublicEventsUseCase,
    PUBLIC_EVENTS_LIMIT,
    UpdateRoomBookingUseCase,
    effectivePublicOnSite,
} from '../room-booking-usecases.js';
import type {
    ConflictGuard,
    RoomBookingCreateData,
    RoomBookingItem,
    RoomBookingRepository,
    RoomBookingUpdateData,
} from '../../ports/external/room-booking-repository.js';

const ROOM = 'room-1';

const BOOKING: RoomBookingItem = {
    id: 'b-1',
    type: 'EVENT',
    title: 'DIA DE CAMPO',
    description: 'Observações internas da equipe',
    publicOnSite: false,
    publicDescription: null,
    roomId: ROOM,
    roomName: 'AUDITORIO',
    startTime: new Date('2026-10-05T08:00:00.000Z'),
    endTime: new Date('2026-10-05T12:00:00.000Z'),
    responsible: null,
    responsibleName: null,
    seriesId: null,
};

function makeRepo(existing: RoomBookingItem = BOOKING) {
    const repo = {
        list: vi.fn().mockResolvedValue([]),
        listPublicEvents: vi.fn().mockResolvedValue([]),
        schedule: vi.fn().mockResolvedValue([]),
        findById: vi.fn().mockResolvedValue(existing),
        occupants: vi.fn(),
        createMany: vi.fn(async (rows: RoomBookingCreateData[], guard: ConflictGuard) => {
            guard([]);
            return { result: rows.map((_, i) => `id-${i}`) };
        }),
        update: vi.fn(async (id: string, data: RoomBookingUpdateData) => ({ result: { ...existing,
...data,
id } })),
        softDelete: vi.fn().mockResolvedValue(1),
        personExists: vi.fn().mockResolvedValue(true),
        roomExists: vi.fn().mockResolvedValue(true),
    };
    return repo as typeof repo & RoomBookingRepository;
}

const input = {
    type: 'EVENT',
    title: 'DIA DE CAMPO',
    roomId: ROOM,
    startTime: '2026-10-05T08:00:00.000Z',
    endTime: '2026-10-05T12:00:00.000Z',
};

describe('effectivePublicOnSite', () => {
    it('evento respeita o que veio no corpo', () => {
        expect(effectivePublicOnSite('EVENT', true)).toBe(true);
        expect(effectivePublicOnSite('EVENT', false, true)).toBe(false);
    });

    it('sem informar, mantém o que já estava', () => {
        expect(effectivePublicOnSite('EVENT', undefined, true)).toBe(true);
        expect(effectivePublicOnSite('EVENT', undefined)).toBe(false);
    });

    it('reunião nunca vai para o site', () => {
        expect(effectivePublicOnSite('MEETING', true)).toBe(false);
        expect(effectivePublicOnSite('MEETING', undefined, true)).toBe(false);
    });
});

describe('CreateRoomBookingUseCase — publicação no site', () => {
    beforeEach(() => vi.clearAllMocks());

    it('evento marcado grava a publicação e o texto público', async () => {
        const repo = makeRepo();
        await new CreateRoomBookingUseCase(repo).execute({
            ...input,
            publicOnSite: true,
            publicDescription: 'Aberto ao público',
        });
        const rows = vi.mocked(repo.createMany).mock.calls[0][0];
        expect(rows[0].publicOnSite).toBe(true);
        expect(rows[0].publicDescription).toBe('Aberto ao público');
    });

    it('reunião não é publicada nem guarda o texto público', async () => {
        const repo = makeRepo();
        await new CreateRoomBookingUseCase(repo).execute({
            ...input,
            type: 'MEETING',
            publicOnSite: true,
            publicDescription: 'Texto',
        });
        const rows = vi.mocked(repo.createMany).mock.calls[0][0];
        expect(rows[0].publicOnSite).toBe(false);
        expect(rows[0].publicDescription).toBeNull();
    });

    it('sem marcar, a reserva fica fora do site', async () => {
        const repo = makeRepo();
        await new CreateRoomBookingUseCase(repo).execute(input);
        expect(vi.mocked(repo.createMany).mock.calls[0][0][0].publicOnSite).toBe(false);
    });
});

describe('UpdateRoomBookingUseCase — publicação no site', () => {
    beforeEach(() => vi.clearAllMocks());

    it('marcar publica o evento', async () => {
        const repo = makeRepo();
        await new UpdateRoomBookingUseCase(repo).execute('b-1', { publicOnSite: true });
        expect(vi.mocked(repo.update).mock.calls[0][1]).toMatchObject({ publicOnSite: true });
    });

    it('virar reunião tira do site e limpa o texto público', async () => {
        const repo = makeRepo({ ...BOOKING,
publicOnSite: true,
publicDescription: 'Aberto ao público' });
        await new UpdateRoomBookingUseCase(repo).execute('b-1', { type: 'MEETING' });
        expect(vi.mocked(repo.update).mock.calls[0][1]).toMatchObject({
            publicOnSite: false,
            publicDescription: null,
        });
    });

    it('editar só o título não mexe na publicação', async () => {
        const repo = makeRepo({ ...BOOKING,
publicOnSite: true });
        await new UpdateRoomBookingUseCase(repo).execute('b-1', { title: 'OUTRO TITULO' });
        expect(vi.mocked(repo.update).mock.calls[0][1].publicOnSite).toBeUndefined();
    });
});

describe('ListPublicEventsUseCase', () => {
    beforeEach(() => vi.clearAllMocks());

    it('pergunta ao repositório a partir do relógio de Brasília', async () => {
        const repo = makeRepo();
        // 11:00 UTC = 08:00 em Terra Roxa (mesmo formato dos horários gravados).
        await new ListPublicEventsUseCase(repo).execute(new Date('2026-09-23T11:00:00.000Z'));
        expect(repo.listPublicEvents).toHaveBeenCalledWith(
            new Date('2026-09-23T08:00:00.000Z'),
            PUBLIC_EVENTS_LIMIT,
        );
    });

    it('devolve os eventos na ordem que vieram', async () => {
        const repo = makeRepo();
        const events = [
            { id: 'e1',
title: 'A',
description: null,
startTime: new Date(),
endTime: new Date(),
roomName: 'AUDITORIO' },
        ];
        vi.mocked(repo.listPublicEvents).mockResolvedValue(events);
        const r = await new ListPublicEventsUseCase(repo).execute();
        expect(r.events).toEqual(events);
    });
});
