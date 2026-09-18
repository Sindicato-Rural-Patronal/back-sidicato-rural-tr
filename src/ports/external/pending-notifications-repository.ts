// Consultas das pendências do painel (sino de notificações). Tudo barato:
// contagens e listas curtas, sem uma consulta por item.

export type PendingCourseStatus = 'PUBLIC' | 'PRIVATE' | 'IN_PROGRESS';

/**
 * Filtro de cursos (não excluídos). As datas seguem o formato gravado no curso:
 * hora "de parede" de Brasília rotulada com Z. Limites `*From` incluem, `*Before` excluem.
 */
export type PendingCourseFilter = {
    statuses: PendingCourseStatus[];
    startFrom?: Date;
    startBefore?: Date;
    endFrom?: Date;
    endBefore?: Date;
    /** Só cursos com pelo menos uma inscrição ativa sem confirmar. */
    onlyWithUnconfirmed?: boolean;
    /** Ordem crescente por este campo. */
    orderBy: 'startTime' | 'endTime';
    take: number;
};

export type PendingCourse = {
    id: string;
    name: string;
    status: string;
    startTime: Date;
    endTime: Date;
    /** Inscrições ativas (não excluídas) ainda não confirmadas. */
    unconfirmedCount: number;
};

/** Total e os primeiros nomes (para "A, B, C e mais N"). */
export type NamedCount = {
    total: number;
    names: string[];
};

/** Reserva de sala (evento/reunião) para o aviso do dia. */
export type PendingRoomBooking = {
    title: string;
    roomName: string;
    /** Hora "de parede" de Brasília rotulada com Z, como no curso. */
    startTime: Date;
};

export type RoomBookingsOverlap = {
    total: number;
    /** As primeiras por hora de início. */
    items: PendingRoomBooking[];
};

export interface PendingNotificationsRepository {
    listCourses(filter: PendingCourseFilter): Promise<PendingCourse[]>;
    /** Lançamentos de cotação com referenceDate em [from, before) — qualquer período. */
    countQuoteHistory(from: Date, before: Date): Promise<number>;
    /** Galerias ativas sem nenhuma foto. */
    galleriesWithoutPhoto(take: number): Promise<NamedCount>;
    /** Empresas parceiras ativas sem logo (nome fantasia quando houver). */
    partnersWithoutLogo(take: number): Promise<NamedCount>;
    /** Pessoas com cadastro incompleto — mesmo critério do filtro da lista de pessoas. */
    countIncompleteRegistrations(): Promise<number>;
    /** Associados ativos com validade em [from, before), vencendo primeiro. */
    membershipsExpiring(from: Date, before: Date, take: number): Promise<NamedCount>;
    /** Reservas de sala não excluídas que ocupam algum momento de [from, before) — começam antes do fim e terminam depois do início. */
    roomBookingsOverlapping(from: Date, before: Date, take: number): Promise<RoomBookingsOverlap>;
}
