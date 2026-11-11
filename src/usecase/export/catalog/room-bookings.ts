import { z } from 'zod';
import type { ExportRepository, RoomBookingExportRow } from '../../../ports/external/export-repository.js';
import { BOOKING_TYPE_LABEL, label } from '../../../lib/export-labels.js';
import { day, describePeriod, empty, idList, text } from '../filters.js';
import { reportFields } from './person-fields.js';
import type { ExportField, ExportFilterDescription, ExportSource } from './types.js';

// Fonte `room-bookings`: as reservas de sala da Agenda do Painel Geral
// (permissão READ_COURSE). Os cursos não entram, como sempre. Pessoal é o
// responsável (decisão 006, inventário, item 14).
//
// Os horários saem como foram gravados (relógio de Brasília com Z, igual ao
// curso). O período da tela são dias: [de 00:00, até + 1 dia 00:00), e a
// reserva entra quando sobrepõe esse intervalo.
//
// AS CHAVES SÃO CONTRATO: não se renomeia nem se reaproveita uma chave.

const filters = z.object({
    ids: idList,
    from: day,
    to: day,
    roomId: text,
    type: z.preprocess(empty, z.enum(['EVENT', 'MEETING'], { message: 'Filtro inválido' }).optional()),
    search: text,
});

type RoomBookingFilters = z.infer<typeof filters>;

const filterLabels = {
    from: 'De',
    to: 'Até',
    roomId: 'Sala',
    type: 'Tipo',
    search: 'Busca',
};

const DAY_MS = 24 * 60 * 60 * 1000;

const bookingFields: ExportField<RoomBookingExportRow>[] = [
    // Reserva
    { key: 'type',
label: 'Tipo',
group: 'Reserva',
type: 'text',
privacy: 'comum',
weight: 1.5,
value: b => label(BOOKING_TYPE_LABEL, b.type) },
    { key: 'title',
label: 'Título',
group: 'Reserva',
type: 'text',
privacy: 'comum',
weight: 3,
value: b => b.title },
    // Observação interna da equipe (nunca vai para o site).
    { key: 'description',
label: 'Descrição',
group: 'Reserva',
type: 'text',
privacy: 'comum',
weight: 4,
value: b => b.description },
    { key: 'series',
label: 'Série',
group: 'Reserva',
type: 'boolean',
privacy: 'comum',
value: b => !!b.seriesId },

    // Quando e onde (horário de parede: sai como foi gravado)
    { key: 'room',
label: 'Sala',
group: 'Quando e onde',
type: 'text',
privacy: 'comum',
value: b => b.roomName },
    { key: 'startTime',
label: 'Início',
group: 'Quando e onde',
type: 'wallclock',
privacy: 'comum',
value: b => b.startTime },
    { key: 'endTime',
label: 'Término',
group: 'Quando e onde',
type: 'wallclock',
privacy: 'comum',
value: b => b.endTime },

    // Responsável: a pessoa cadastrada ou, sem ela, o nome digitado.
    {
        key: 'responsible',
        label: 'Responsável',
        group: 'Responsável',
        type: 'text',
        privacy: 'pessoal',
        weight: 3,
        value: b => b.responsible?.name ?? b.responsibleName,
    },

    // No site (só evento é publicado)
    { key: 'publicOnSite',
label: 'No site',
group: 'No site',
type: 'boolean',
privacy: 'comum',
value: b => b.publicOnSite },
    { key: 'publicDescription',
label: 'Texto no site',
group: 'No site',
type: 'text',
privacy: 'comum',
weight: 4,
value: b => b.publicDescription },
];

/** As 8 colunas de hoje, na ordem de hoje. Congeladas pelo teste de ouro. */
const PADRAO = ['type', 'title', 'room', 'startTime', 'endTime', 'responsible', 'description', 'series'];

/**
 * "Período: 05/10/2026 a 11/10/2026 · Sala: AUDITORIO · Tipo: Reunião ·
 * Busca: diretoria". A sala vem das linhas (filtradas por ela, todas têm a
 * mesma); sem nenhuma linha, pelo id.
 */
async function describeFilters(
    f: RoomBookingFilters,
    rows: RoomBookingExportRow[],
    repo: ExportRepository,
): Promise<ExportFilterDescription[]> {
    const out: ExportFilterDescription[] = [...describePeriod(f.from, f.to)];
    if (f.roomId) {
        const name = rows[0]?.roomName ?? (await repo.roomName(f.roomId));
        out.push({ nome: filterLabels.roomId,
valor: name ?? f.roomId });
    }
    if (f.type) out.push({ nome: filterLabels.type,
valor: label(BOOKING_TYPE_LABEL, f.type) });
    if (f.search) out.push({ nome: filterLabels.search,
valor: f.search });
    return out;
}

export const roomBookingsSource: ExportSource<RoomBookingExportRow, RoomBookingFilters> = {
    dataset: 'room-bookings',
    filters,
    filterLabels,
    describeFilters,
    fields: [...bookingFields, ...reportFields<RoomBookingExportRow>()],
    padrao: PADRAO,
    modelos: [],
    // Dias do filtro → período [from 00:00, to + 1 dia 00:00) no relógio gravado.
    query: (repo, { from, to, ...rest }, take) =>
        repo.roomBookings({
            ...rest,
            from: from ? new Date(`${from}T00:00:00.000Z`) : undefined,
            to: to ? new Date(new Date(`${to}T00:00:00.000Z`).getTime() + DAY_MS) : undefined,
            take,
        }),
    firstName: row => row.title,
};
