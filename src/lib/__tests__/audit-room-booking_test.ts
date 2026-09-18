import { describe, it, expect } from 'vitest';
import type { PrismaClient } from '@prisma/client/extension';
import { deriveAuditEntity } from '../audit-entity.js';
import { AUDIT_ENTITY_NOUNS, describeAuditAction } from '../audit-sentence.js';
import { lookupTargetLabel, shouldLookupTargetLabel } from '../audit-label.js';
import { shouldSnapshot, snapshotTarget } from '../audit-snapshot.js';
import { diffSnapshots, removedSnapshot } from '../audit-diff.js';

// Reservas de sala (eventos e reuniões) na trilha de auditoria.
const ID = '3f2b8c1e-4a5d-4e6f-8a9b-0c1d2e3f4a5b';
const PERSON = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

function sentence(method: string, path: string, targetLabel: string | null = null) {
    return describeAuditAction({ method,
path,
entity: deriveAuditEntity(path),
targetLabel });
}

function fakePrisma(booking: Record<string, unknown> | null) {
    return {
        roomBooking: {
            findUnique: async () => booking,
        },
    } as unknown as PrismaClient;
}

const ROW = {
    id: ID,
    type: 'MEETING',
    title: 'Reunião da diretoria',
    description: null,
    roomId: 'room-1',
    room: { name: 'SALA 1' },
    startTime: new Date('2026-09-17T14:00:00.000Z'),
    endTime: new Date('2026-09-17T16:00:00.000Z'),
    responsibleUserDataId: PERSON,
    responsible: { name: 'Ana' },
    responsibleName: null,
    seriesId: 'series-1',
    isDeleted: false,
    deletedAt: null,
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    updatedAt: new Date('2026-09-01T00:00:00.000Z'),
};

describe('auditoria: reserva de sala', () => {
    it('entidade "Reserva de sala" (não "Sala") com substantivo feminino', () => {
        expect(deriveAuditEntity('/admin/room-bookings')).toBe('Reserva de sala');
        expect(deriveAuditEntity(`/admin/room-bookings/${ID}`)).toBe('Reserva de sala');
        expect(deriveAuditEntity(`/admin/room-bookings/${ID}?scope=future`)).toBe('Reserva de sala');
        expect(deriveAuditEntity(`/rooms/${ID}`)).toBe('Sala');
        expect(AUDIT_ENTITY_NOUNS['Reserva de sala']).toEqual({ noun: 'reserva de sala',
g: 'f' });
    });

    it('frases de criar, editar e excluir', () => {
        expect(sentence('POST', '/admin/room-bookings')).toBe('Criou uma reserva de sala');
        expect(sentence('POST', '/admin/room-bookings', 'Palestra')).toBe('Criou a reserva de sala "Palestra"');
        expect(sentence('PATCH', `/admin/room-bookings/${ID}`, 'Palestra')).toBe('Editou a reserva de sala "Palestra"');
        expect(sentence('DELETE', `/admin/room-bookings/${ID}`, 'Palestra')).toBe('Excluiu a reserva de sala "Palestra"');
        expect(sentence('DELETE', `/admin/room-bookings/${ID}?scope=one`, 'Palestra')).toBe('Excluiu a reserva de sala "Palestra"');
    });

    it('exclusão da série a partir desta (?scope=future), quando o caminho mantém a query', () => {
        expect(sentence('DELETE', `/admin/room-bookings/${ID}?scope=future`, 'Palestra'))
            .toBe('Excluiu a reserva de sala "Palestra" e as próximas da série');
        expect(sentence('DELETE', `/admin/room-bookings/${ID}?scope=future`))
            .toBe('Excluiu uma reserva de sala e as próximas da série');
        // Só na exclusão da reserva.
        expect(sentence('PATCH', `/admin/room-bookings/${ID}?scope=future`, 'Palestra'))
            .toBe('Editou a reserva de sala "Palestra"');
    });

    it('busca o título antes de editar/excluir', async () => {
        expect(shouldLookupTargetLabel('PATCH', `/admin/room-bookings/${ID}`)).toBe(true);
        expect(shouldLookupTargetLabel('DELETE', `/admin/room-bookings/${ID}`)).toBe(true);
        expect(shouldLookupTargetLabel('POST', '/admin/room-bookings')).toBe(false);
        expect(await lookupTargetLabel(fakePrisma(ROW), `/admin/room-bookings/${ID}`)).toBe('Reunião da diretoria');
        expect(await lookupTargetLabel(fakePrisma(null), `/admin/room-bookings/${ID}`)).toBeNull();
    });

    it('antes/depois: sala e responsável pelo nome, sem colunas internas', async () => {
        expect(shouldSnapshot('PATCH', `/admin/room-bookings/${ID}`)).toBe(true);
        expect(shouldSnapshot('DELETE', `/admin/room-bookings/${ID}`)).toBe(true);
        expect(shouldSnapshot('POST', '/admin/room-bookings')).toBe(false);

        const before = await snapshotTarget(fakePrisma(ROW), 'PATCH', `/admin/room-bookings/${ID}`, null);
        expect(before).toMatchObject({ title: 'Reunião da diretoria',
room: 'SALA 1',
responsible: 'Ana',
type: 'MEETING' });
        for (const key of ['roomId', 'responsibleUserDataId', 'seriesId', 'isDeleted', 'deletedAt', 'createdAt', 'updatedAt']) {
            expect(before).not.toHaveProperty(key);
        }

        const after = await snapshotTarget(
            fakePrisma({ ...ROW,
title: 'Reunião mensal',
room: { name: 'AUDITORIO' },
responsibleUserDataId: null,
responsible: null,
responsibleName: 'João' }),
            'PATCH',
            `/admin/room-bookings/${ID}`,
            null,
        );
        expect(diffSnapshots(before!, after)).toEqual([
            { field: 'title',
before: 'Reunião da diretoria',
after: 'Reunião mensal' },
            { field: 'responsibleName',
before: null,
after: 'João' },
            { field: 'room',
before: 'SALA 1',
after: 'AUDITORIO' },
            { field: 'responsible',
before: 'Ana',
after: null },
        ]);
        expect(removedSnapshot(before!)?.map(c => c.field)).toEqual(
            expect.arrayContaining(['title', 'room', 'responsible', 'startTime', 'endTime']),
        );
    });
});
