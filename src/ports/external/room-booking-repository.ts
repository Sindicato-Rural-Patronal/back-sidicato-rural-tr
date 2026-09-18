// Reservas de sala (eventos e reuniões). Horários em hora "de parede" de
// Brasília rotulada em UTC, como os cursos.

export type BookingType = 'EVENT' | 'MEETING';

export type RoomOccupantKind = 'COURSE' | 'EVENT' | 'MEETING';

/** Algo que ocupa a sala num período (curso ou reserva). */
export type RoomOccupant = {
    kind: RoomOccupantKind;
    id: string;
    title: string;
    startTime: Date;
    endTime: Date;
};

/** Formato da listagem, do PATCH e da exportação. */
export type RoomBookingItem = {
    id: string;
    type: BookingType;
    title: string;
    /** Observações internas da equipe (nunca vão para o site). */
    description: string | null;
    /** Aparece em /eventos; só vale para type = EVENT. */
    publicOnSite: boolean;
    /** Texto do evento no site. */
    publicDescription: string | null;
    roomId: string;
    roomName: string;
    startTime: Date;
    endTime: Date;
    responsible: {
        id: string;
        name: string;
    } | null;
    responsibleName: string | null;
    seriesId: string | null;
};

/** Item da agenda das salas: curso ou reserva. */
export type RoomScheduleItem = {
    kind: RoomOccupantKind;
    id: string;
    title: string;
    roomId: string;
    roomName: string;
    startTime: Date;
    endTime: Date;
    /** Status do curso; null para reservas. */
    status: string | null;
    seriesId: string | null;
    /** Evento publicado no site (sempre false para cursos e reuniões). */
    publicOnSite: boolean;
};

/** Evento publicado no site (rota pública GET /events). */
export type PublicEventItem = {
    id: string;
    title: string;
    description: string | null;
    startTime: Date;
    endTime: Date;
    roomName: string;
};

export type RoomBookingFilters = {
    /** Início do período (inclusive). */
    from?: Date;
    /** Fim do período (exclusivo). */
    to?: Date;
    roomId?: string;
    type?: BookingType;
    search?: string;
    /** Quando preenchido, os filtros são ignorados (exportação da seleção). */
    ids?: string[];
};

export type RoomBookingCreateData = {
    type: BookingType;
    title: string;
    description: string | null;
    publicOnSite: boolean;
    publicDescription: string | null;
    roomId: string;
    startTime: Date;
    endTime: Date;
    responsibleUserDataId: string | null;
    responsibleName: string | null;
    seriesId: string | null;
};

export type RoomBookingUpdateData = Partial<Omit<RoomBookingCreateData, 'seriesId'>>;

/** O que ignorar ao procurar conflito (o próprio registro sendo editado). */
export type OccupantExclusion = {
    courseId?: string;
    bookingId?: string;
};

/**
 * Recebe os ocupantes da sala no período e devolve o conflito (ou null).
 * Chamado dentro da transação, antes de gravar.
 */
export type ConflictGuard = (occupants: RoomOccupant[]) => RoomOccupant | null;

export type GuardedWrite<T> = { conflict: RoomOccupant } | { result: T };

export interface RoomBookingRepository {
    /** Não excluídas que sobrepõem o período, por início. */
    list(filters: RoomBookingFilters): Promise<RoomBookingItem[]>;
    /** Eventos publicados no site que ainda não acabaram em `from`, por início. */
    listPublicEvents(from: Date, limit: number): Promise<PublicEventItem[]>;
    /** Cursos (não excluídos) e reservas que sobrepõem o período, por início. */
    schedule(filters: {
        from: Date;
        to: Date;
        roomId?: string;
    }): Promise<RoomScheduleItem[]>;
    findById(id: string): Promise<RoomBookingItem | null>;
    /** Cursos e reservas não excluídos da sala que sobrepõem [start, end). */
    occupants(roomId: string, start: Date, end: Date, exclude?: OccupantExclusion): Promise<RoomOccupant[]>;
    /**
     * Cria todas as ocorrências numa transação: lê os ocupantes da sala no
     * período total, passa pelo `guard` e só grava se não houver conflito.
     */
    createMany(rows: RoomBookingCreateData[], guard: ConflictGuard): Promise<GuardedWrite<string[]>>;
    /** Atualiza uma ocorrência com a mesma checagem (sem contar ela mesma); guard null = sem checagem. */
    update(
        id: string,
        data: RoomBookingUpdateData,
        slot: {
            roomId: string;
            startTime: Date;
            endTime: Date;
        },
        guard: ConflictGuard | null,
    ): Promise<GuardedWrite<RoomBookingItem>>;
    /** Exclusão lógica; `future` = esta e as seguintes da mesma série. Devolve quantas. */
    softDelete(booking: RoomBookingItem, scope: 'one' | 'future'): Promise<number>;
    /** A pessoa existe e não foi excluída. */
    personExists(userDataId: string): Promise<boolean>;
    roomExists(roomId: string): Promise<boolean>;
}
