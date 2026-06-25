import type {
    CourseRepository,
    CourseWithDetails,
    CourseStatus,
} from '../ports/external/course-repository.js';
import { CourseNotFoundError } from '../errors/not-found.js';

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
        title: string | null;
        category: string | null;
        name: string;
        bio: string | null;
        avatar: string | null;
        linkedin: string | null;
        instagram: string | null;
        facebook: string | null;
    }[];
    registrationDeadline: string | null;
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
        console.log(`[GetCourseDetail] id="${id}"`);
        const course = await this.courseRepository.findById(id);
        if (!course) {
            console.log(`[GetCourseDetail] not found: ${id}`);
            return { error: new CourseNotFoundError() };
        }
        if (course.status === 'UNPUBLISHED') {
            console.log(`[GetCourseDetail] blocked UNPUBLISHED: ${id}`);
            return { error: new CourseNotFoundError() };
        }
        console.log(`[GetCourseDetail] found: name="${course.name}" status="${course.status}"`);
        return { course: mapToFrontend(course) };
    }
}
