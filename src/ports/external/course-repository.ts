import type { courseModel, CoursePhotoModel } from '../../generated/prisma/models.js';
import { CourseStatus } from '../../generated/prisma/enums.js';
import type { RoomOccupant } from './room-booking-repository.js';

export { CourseStatus };

export type CourseCreateData = {
    name: string;
    description: string;
    roomId: string;
    startTime: Date;
    endTime: Date;
    status?: CourseStatus;
    price?: number;
    workloadHours?: number;
    registrationDeadline?: Date;
    observations?: string;
    eventNumber?: string;
    minStudents?: number;
};

export type CourseUpdateData = {
    name?: string;
    description?: string;
    roomId?: string;
    startTime?: Date;
    endTime?: Date;
    status?: CourseStatus;
    bannerUrl?: string;
    /** Miniatura da capa (cards); null quando não deu para gerar. */
    bannerThumbUrl?: string | null;
    price?: number;
    workloadHours?: number;
    registrationDeadline?: Date | null;
    observations?: string;
    eventNumber?: string;
    minStudents?: number;
    preEnrolled?: number;
    waitlist?: number;
};

export type CourseWithDetails = courseModel & {
    room: {
        name: string;
        maxCapacity: number;
    };
    photos: CoursePhotoModel[];
    _count: { courseUserRegistration: number };
    instructors: Array<{
        id: string;
        title: string | null;
        category: string | null;
        instructor: {
            id: string;
            bio: string | null;
            linkedin: string | null;
            instagram: string | null;
            facebook: string | null;
            userData: {
 id: string;
name: string;
avatar: string | null 
};
        };
    }>;
};

export type CourseListFilters = {
    status?: CourseStatus;
    /** Titulo ou numero do evento. */
    search?: string;
    /** Ano de inicio do curso. Filtro proprio, separado da busca por texto. */
    year?: number;
    /** So os que ainda nao terminaram neste instante (hora de parede): `endTime >= endsFrom`. */
    endsFrom?: Date;
    /** So os que ja terminaram: `endTime < endedBefore`. */
    endedBefore?: Date;
};

/** Gravação que confere a sala: ou grava (`result`), ou devolve quem ocupa (`conflict`). */
export type RoomGuardedWrite<T> = {
 result: T;
conflict?: undefined 
} | {
 conflict: RoomOccupant;
result?: undefined 
};

/** Ordem pelo inicio do curso: `asc` = mais cedo primeiro (padrao). */
export type CourseListOrder = 'asc' | 'desc';

export interface CourseRepository {
    findById(id: string): Promise<CourseWithDetails | null>;
    findAll(filters?: CourseListFilters, skip?: number, take?: number, order?: CourseListOrder): Promise<CourseWithDetails[]>;
    count(filters?: CourseListFilters): Promise<number>;
    /** Anos que tem curso cadastrado, do mais recente para o mais antigo. */
    years(): Promise<number[]>;
    update(id: string, data: CourseUpdateData): Promise<courseModel | null>;
    delete(id: string): Promise<boolean>;
    /**
     * Cria o curso com a sala travada (`pg_advisory_xact_lock`, a mesma trava
     * das reservas): confere se outro curso ou reserva ocupa a sala no período e
     * grava na mesma transação. Ocupada → `{ conflict }` e nada é gravado.
     */
    createInRoom(course: CourseCreateData): Promise<RoomGuardedWrite<courseModel>>;
    /**
     * Edita o curso que muda de sala ou de horário, com a mesma trava e a mesma
     * checagem (o próprio curso não conta). `slot` = sala e horário depois da
     * edição. Curso inexistente → `{ result: null }`.
     */
    updateInRoom(
        id: string,
        data: CourseUpdateData,
        slot: {
 roomId: string;
startTime: Date;
endTime: Date 
},
    ): Promise<RoomGuardedWrite<courseModel | null>>;
    addPhoto(courseId: string, url: string, caption?: string): Promise<CoursePhotoModel>;
    deletePhoto(photoId: string): Promise<boolean>;
}
