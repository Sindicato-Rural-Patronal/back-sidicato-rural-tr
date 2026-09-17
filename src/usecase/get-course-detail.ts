import type {
    CourseRepository,
    CourseWithDetails,
    CourseStatus,
} from '../ports/external/course-repository.js';
import { CourseNotFoundError } from '../errors/not-found.js';
import { deadlineTime } from '../lib/course-registration-rules.js';

export type CourseFrontendDetail = {
    id: string;
    status: CourseStatus;
    title: string;
    description: string;
    maxStudents: number;
    minStudents: number;
    enrolled: number;
    preEnrolled: number;
    waitlist: number;
    coverImage: string | null;
    /** Miniatura WebP da capa (cards); null → usar coverImage. */
    coverImageThumb: string | null;
    price: number;
    startDate: string;
    endDate: string;
    startTime: string;
    endTime: string;
    workloadHours: number;
    location: string;
    instructorName: string;
    instructors: {
        id: string;
        /** Pessoa do cadastro (UserData) do instrutor. */
        userDataId: string;
        title: string | null;
        category: string | null;
        name: string;
        bio: string | null;
        avatar: string | null;
        linkedin: string | null;
        instagram: string | null;
        facebook: string | null;
    }[];
    /** Dia do prazo, "AAAA-MM-DD". */
    registrationDeadline: string | null;
    /** Hora do prazo "HH:MM" quando o painel informou; null = vale o dia inteiro. */
    registrationDeadlineTime: string | null;
    observations: string | null;
    eventNumber: string | null;
    photoGallery: {
        id: string;
        url: string;
        caption: string;
    }[];
};

export function mapToFrontend(course: CourseWithDetails): CourseFrontendDetail {
    const instructorName = course.instructors[0]?.instructor?.userData?.name ?? '';
    return {
        id: course.id,
        status: course.status,
        title: course.name,
        description: course.description,
        maxStudents: course.room.maxCapacity,
        minStudents: course.minStudents,
        enrolled: course._count.courseUserRegistration,
        preEnrolled: course.preEnrolled,
        waitlist: course.waitlist,
        coverImage: course.bannerUrl ?? null,
        coverImageThumb: course.bannerThumbUrl ?? null,
        price: course.price,
        startDate: course.startTime.toISOString().split('T')[0],
        endDate: course.endTime.toISOString().split('T')[0],
        startTime: course.startTime.toISOString().split('T')[1].slice(0, 5),
        endTime: course.endTime.toISOString().split('T')[1].slice(0, 5),
        workloadHours: course.workloadHours,
        location: course.room.name,
        instructorName,
        instructors: course.instructors.map((ci) => ({
            id: ci.id,
            userDataId: ci.instructor?.userData?.id ?? '',
            title: ci.title ?? null,
            category: ci.category ?? null,
            name: ci.instructor?.userData?.name ?? '',
            bio: ci.instructor?.bio ?? null,
            avatar: ci.instructor?.userData?.avatar ?? null,
            linkedin: ci.instructor?.linkedin ?? null,
            instagram: ci.instructor?.instagram ?? null,
            facebook: ci.instructor?.facebook ?? null,
        })),
        registrationDeadline: course.registrationDeadline?.toISOString().split('T')[0] ?? null,
        registrationDeadlineTime: deadlineTime(course.registrationDeadline),
        observations: course.observations ?? null,
        eventNumber: course.eventNumber ?? null,
        photoGallery: course.photos.map(
            (p: {
 id: string;
url: string;
caption: string | null 
}) => ({
                id: p.id,
                url: p.url,
                caption: p.caption ?? '',
            }),
        ),
    };
}

type GetCourseDetailResponse = {
    error?: Error;
    course?: CourseFrontendDetail;
};

export class GetCourseDetailUseCase {
    constructor(private readonly courseRepository: CourseRepository) {}

    async execute(id: string): Promise<GetCourseDetailResponse> {
        const course = await this.courseRepository.findById(id);
        if (!course) {
            return { error: new CourseNotFoundError() };
        }
        if (course.status === 'UNPUBLISHED') {
            return { error: new CourseNotFoundError() };
        }
        return { course: mapToFrontend(course) };
    }
}
