import { CourseRepository, CourseWithDetails, CourseStatus } from "../ports/external/course-repository.js";

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
    registrationDeadline: string | null;
    observations: string | null;
    eventNumber: string | null;
    photoGallery: { id: string; url: string; caption: string }[];
};

export function mapToFrontend(course: CourseWithDetails): CourseFrontendDetail {
    const instructorName = course.Instructors[0]?.userData?.name ?? '';
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
        registrationDeadline: course.registrationDeadline?.toISOString().split('T')[0] ?? null,
        observations: course.observations ?? null,
        eventNumber: course.eventNumber ?? null,
        photoGallery: course.photos.map((p: { id: string; url: string; caption: string | null }) => ({ id: p.id, url: p.url, caption: p.caption ?? '' })),
    };
}

type GetCourseDetailResponse = {
    success: boolean;
    error?: Error;
    course?: CourseFrontendDetail;
};

export class GetCourseDetailUseCase {
    constructor(private readonly courseRepository: CourseRepository) {}

    async execute(id: string): Promise<GetCourseDetailResponse> {
        const course = await this.courseRepository.findById(id);
        if (!course) {
            return { success: false, error: new Error('Course not found') };
        }
        return { success: true, course: mapToFrontend(course) };
    }
}
