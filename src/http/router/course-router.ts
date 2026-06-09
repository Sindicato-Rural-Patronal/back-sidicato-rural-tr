import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client/extension';
import { CreateCourseController } from '../controllers/create-course.js';
import { CreateCourseUseCase } from '../../usecase/create-course.js';
import { createCourseAdapter } from '../../adapter/database/course-adapter.js';
import { createRoomAdapter } from '../../adapter/database/room-adapter.js';
import { UploadBannerCourseController } from '../controllers/upload-banner-course.js';
import { UploadCourseBannerUseCase } from '../../usecase/upload-banner-course.js';
import { createStorageAdapter } from '../../adapter/storage/factory.js';
import { GetCourseDetailController } from '../controllers/get-course-detail.js';
import { GetCourseDetailUseCase } from '../../usecase/get-course-detail.js';
import { ListCoursesController } from '../controllers/list-courses.js';
import { ListCoursesUseCase } from '../../usecase/list-courses.js';
import { ListAllCoursesController } from '../controllers/list-all-courses.js';
import { ListAllCoursesUseCase } from '../../usecase/list-all-courses.js';
import { createUserAdminAdapter } from '../../adapter/database/user-admin-adapter.js';
import { createRuleAdapter } from '../../adapter/database/rule-adapter.js';
import { UpdateCourseController } from '../controllers/update-course.js';
import { UpdateCourseUseCase } from '../../usecase/update-course.js';
import { DeleteCourseController } from '../controllers/delete-course.js';
import { DeleteCourseUseCase } from '../../usecase/delete-course.js';
import { AddCoursePhotoController } from '../controllers/add-course-photo.js';
import { AddCoursePhotoUseCase } from '../../usecase/add-course-photo.js';
import { DeleteCoursePhotoController } from '../controllers/delete-course-photo.js';
import { DeleteCoursePhotoUseCase } from '../../usecase/delete-course-photo.js';
import { GetAdminCourseDetailController } from '../controllers/get-admin-course-detail.js';
import { GetAdminCourseDetailUseCase } from '../../usecase/get-admin-course-detail.js';

const paginationQuerySchema = {
    type: 'object',
    properties: {
        page: { type: 'integer', minimum: 1, default: 1 },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
    },
} as const;

const pagedResponseSchema = (itemSchema: object) => ({
    type: 'object',
    properties: {
        data: { type: 'array', items: itemSchema },
        total: { type: 'integer' },
        page: { type: 'integer' },
        limit: { type: 'integer' },
        totalPages: { type: 'integer' },
    },
});

const courseDetailProperties = {
    id: { type: 'string' },
    status: { type: 'string', enum: ['PUBLICO', 'PRIVADO', 'NAO_PUBLICADO'] },
    title: { type: 'string' },
    description: { type: 'string' },
    maxStudents: { type: 'integer' },
    minStudents: { type: 'integer' },
    enrolled: { type: 'integer' },
    preEnrolled: { type: 'integer' },
    waitlist: { type: 'integer' },
    coverImage: { type: 'string', nullable: true },
    price: { type: 'number' },
    startDate: { type: 'string' },
    endDate: { type: 'string' },
    startTime: { type: 'string' },
    endTime: { type: 'string' },
    workloadHours: { type: 'integer' },
    location: { type: 'string' },
    instructorName: { type: 'string' },
    registrationDeadline: { type: 'string', nullable: true },
    observations: { type: 'string', nullable: true },
    eventNumber: { type: 'string', nullable: true },
    photoGallery: {
        type: 'array',
        items: {
            type: 'object',
            properties: {
                id: { type: 'string' },
                url: { type: 'string' },
                caption: { type: 'string' },
            },
        },
    },
};

export async function courseRouter(fastify: FastifyInstance, prisma: PrismaClient) {
    const courseRepository = createCourseAdapter(prisma);
    const roomRepository = createRoomAdapter(prisma);
    const storage = createStorageAdapter();

    const userAdminRepository = createUserAdminAdapter(prisma);
    const ruleRepository = createRuleAdapter(prisma);

    const createCourseController = new CreateCourseController(new CreateCourseUseCase(courseRepository, roomRepository));
    const uploadBannerController = new UploadBannerCourseController(new UploadCourseBannerUseCase(storage, courseRepository));
    const getCourseDetailController = new GetCourseDetailController(new GetCourseDetailUseCase(courseRepository));
    const listCoursesController = new ListCoursesController(new ListCoursesUseCase(courseRepository));
    const listAllCoursesController = new ListAllCoursesController(new ListAllCoursesUseCase(courseRepository, userAdminRepository, ruleRepository));
    const updateCourseController = new UpdateCourseController(new UpdateCourseUseCase(courseRepository, roomRepository, userAdminRepository, ruleRepository));
    const deleteCourseController = new DeleteCourseController(new DeleteCourseUseCase(courseRepository, userAdminRepository, ruleRepository));
    const addCoursePhotoController = new AddCoursePhotoController(new AddCoursePhotoUseCase(courseRepository, storage, userAdminRepository, ruleRepository));
    const deleteCoursePhotoController = new DeleteCoursePhotoController(new DeleteCoursePhotoUseCase(courseRepository, userAdminRepository, ruleRepository));
    const getAdminCourseDetailController = new GetAdminCourseDetailController(new GetAdminCourseDetailUseCase(courseRepository, userAdminRepository, ruleRepository));

    fastify.get('/admin/courses', {
        schema: {
            tags: ['Admin — Courses'],
            summary: 'List all courses (card listing)',
            description: `Returns **all** courses with minimal card data. Requires JWT token with \`READ_COURSE\` permission. Use \`GET /admin/courses/:courseId\` for full detail.`,
            security: [{ bearerAuth: [] }],
            querystring: paginationQuerySchema,
            response: {
                200: pagedResponseSchema({ type: 'object', properties: {
                    id: { type: 'string' },
                    status: { type: 'string', enum: ['PUBLICO', 'PRIVADO', 'NAO_PUBLICADO'] },
                    title: { type: 'string' },
                    eventNumber: { type: 'string', nullable: true },
                    startDate: { type: 'string' },
                    enrolled: { type: 'integer' },
                    maxStudents: { type: 'integer' },
                    price: { type: 'number' },
                    coverImage: { type: 'string', nullable: true },
                    photoCount: { type: 'integer' },
                }}),
                401: { type: 'object', properties: { error: { type: 'string' } } },
                403: { type: 'object', properties: { error: { type: 'string' } } },
            },
        },
    }, (req: FastifyRequest, res: FastifyReply) => listAllCoursesController.handle(req, res));

    fastify.get('/admin/courses/:courseId', {
        schema: {
            tags: ['Admin — Courses'],
            summary: 'Get course full detail (admin)',
            description: `Returns all fields of a course. Requires JWT token with \`READ_COURSE\` permission. Use this when opening the edit/view dialog.`,
            security: [{ bearerAuth: [] }],
            params: {
                type: 'object',
                required: ['courseId'],
                properties: { courseId: { type: 'string' } },
            },
            response: {
                200: { type: 'object', properties: courseDetailProperties },
                401: { type: 'object', properties: { error: { type: 'string' } } },
                403: { type: 'object', properties: { error: { type: 'string' } } },
                404: { type: 'object', properties: { error: { type: 'string' } } },
            },
        },
    }, (req: FastifyRequest<{ Params: { courseId: string } }>, res: FastifyReply) =>
        getAdminCourseDetailController.handle(req, res)
    );

    fastify.get('/courses', {
        schema: {
            tags: ['Courses'],
            summary: 'List courses',
            description: `Returns all **public** courses. Ordered by start date (nearest first).`,
            querystring: paginationQuerySchema,
            response: {
                200: pagedResponseSchema({ type: 'object', properties: courseDetailProperties }),
            },
        },
    }, (req: FastifyRequest, res: FastifyReply) => listCoursesController.handle(req, res));

    fastify.get('/courses/:courseId', {
        schema: {
            tags: ['Courses'],
            summary: 'Course detail',
            description: `Returns the full detail of a course by its ID.

**Business rules:**
- Returns **any** status (\`PUBLICO\`, \`PRIVADO\`, \`NAO_PUBLICADO\`) — ideal for detail pages with direct links
- The \`status\` field indicates visibility: \`PUBLICO\` appears in listings, others only via direct URL
- \`maxStudents\` = room capacity; \`enrolled\` = current number of registrations
- Returns 404 if the course does not exist`,
            params: {
                type: 'object',
                required: ['courseId'],
                properties: { courseId: { type: 'string' } },
            },
            response: {
                200: { type: 'object', properties: courseDetailProperties },
                404: { type: 'object', properties: { error: { type: 'string' } } },
            },
        },
    }, (req: FastifyRequest<{ Params: { courseId: string } }>, res: FastifyReply) =>
        getCourseDetailController.handle(req, res)
    );

    fastify.post('/courses', {
        schema: {
            tags: ['Courses'],
            summary: 'Create course',
            description: `Creates a new course. Requires JWT token with \`CREATE_COURSE\` permission.

**Business rules:**
- \`roomId\` must be the ID of an existing room (from \`GET /rooms\`) — a course requires a room
- **Maximum enrollment capacity** is automatically inherited from \`room.maxCapacity\`; it is not set on the course
- **Scheduling conflict:** if the room already has another course whose period overlaps (\`startTime\`–\`endTime\`), creation is rejected with 400
- \`status\` controls visibility:
  - \`NAO_PUBLICADO\` (default) — draft, does not appear in listings
  - \`PRIVADO\` — accessible via direct link, not in the public listing
  - \`PUBLICO\` — appears in \`GET /courses\`
- \`startTime\` and \`endTime\` are ISO 8601 with timezone (e.g. \`2025-08-10T09:00:00-03:00\`)
- \`registrationDeadline\` optional — enrollment cutoff date (also ISO 8601)
- \`price\` in BRL (float); \`workloadHours\` in whole hours`,
            security: [{ bearerAuth: [] }],
            body: {
                type: 'object',
                required: ['name', 'description', 'roomId', 'startTime', 'endTime'],
                properties: {
                    name: { type: 'string' },
                    description: { type: 'string' },
                    roomId: { type: 'string', format: 'uuid' },
                    status: { type: 'string', enum: ['PUBLICO', 'PRIVADO', 'NAO_PUBLICADO'] },
                    startTime: { type: 'string', format: 'date-time' },
                    endTime: { type: 'string', format: 'date-time' },
                    price: { type: 'number', minimum: 0 },
                    workloadHours: { type: 'integer', minimum: 0 },
                    registrationDeadline: { type: 'string', format: 'date-time' },
                    observations: { type: 'string' },
                },
            },
            response: {
                201: { type: 'object', properties: { id: { type: 'string' } } },
                400: { type: 'object', properties: { error: { type: 'string' } } },
            },
        },
    }, (req: FastifyRequest, res: FastifyReply) => createCourseController.handle(req, res));

    fastify.post('/courses/:courseId/banner', {
        schema: {
            tags: ['Courses'],
            summary: 'Upload course banner',
            description: `Uploads an image as the course banner/cover. Requires JWT token with \`UPDATE_COURSE\` permission.

**Business rules:**
- Send as \`multipart/form-data\` with the file in the \`file\` field
- The storage bucket is created automatically if it does not exist (MinIO in development, S3 in production)
- The URL returned in \`url\` is saved to the course \`coverImage\` field and should be used directly in \`<img>\`
- Uploading a new banner overwrites the previous one
- \`courseId\` must be an existing course ID`,
            security: [{ bearerAuth: [] }],
            consumes: ['multipart/form-data'],
            params: {
                type: 'object',
                required: ['courseId'],
                properties: { courseId: { type: 'string' } },
            },
            response: {
                200: { type: 'object', properties: { url: { type: 'string' } } },
                400: { type: 'object', properties: { error: { type: 'string' } } },
                500: { type: 'object', properties: { error: { type: 'string' } } },
            },
        },
    }, (req: FastifyRequest<{ Params: { courseId: string } }>, res: FastifyReply) =>
        uploadBannerController.handle(req, res)
    );

    fastify.patch('/courses/:courseId', {
        schema: {
            tags: ['Courses'],
            summary: 'Edit course',
            description: `Updates fields of an existing course. Requires JWT token with \`UPDATE_COURSE\` permission.

**Business rules:**
- All fields are optional — only the fields sent are updated
- If \`roomId\` is changed, the room must exist and be available for the period
- If \`startTime\` or \`endTime\` is changed, room availability is re-validated
- The \`status\` field controls course visibility`,
            security: [{ bearerAuth: [] }],
            params: {
                type: 'object',
                required: ['courseId'],
                properties: { courseId: { type: 'string' } },
            },
            body: {
                type: 'object',
                properties: {
                    name: { type: 'string' },
                    description: { type: 'string' },
                    roomId: { type: 'string', format: 'uuid' },
                    status: { type: 'string', enum: ['PUBLICO', 'PRIVADO', 'NAO_PUBLICADO'] },
                    startTime: { type: 'string', format: 'date-time' },
                    endTime: { type: 'string', format: 'date-time' },
                    price: { type: 'number', minimum: 0 },
                    workloadHours: { type: 'integer', minimum: 0 },
                    registrationDeadline: { type: 'string', format: 'date-time', nullable: true },
                    observations: { type: 'string' },
                    eventNumber: { type: 'string' },
                    minStudents: { type: 'integer', minimum: 0 },
                    preEnrolled: { type: 'integer', minimum: 0 },
                    waitlist: { type: 'integer', minimum: 0 },
                },
            },
            response: {
                200: { type: 'object', properties: { message: { type: 'string' } } },
                400: { type: 'object', properties: { error: { type: 'string' } } },
                403: { type: 'object', properties: { error: { type: 'string' } } },
            },
        },
    }, (req: FastifyRequest<{ Params: { courseId: string } }>, res: FastifyReply) =>
        updateCourseController.handle(req, res)
    );

    fastify.delete('/courses/:courseId', {
        schema: {
            tags: ['Courses'],
            summary: 'Delete course',
            description: `Removes a course and all its associated data (photos, registrations). Requires JWT token with \`DELETE_COURSE\` permission.

**Business rules:**
- This operation is irreversible
- Also removes registrations (\`courseUserRegistration\`) and gallery photos (\`CoursePhoto\`) linked to the course
- The banner in storage is **not** removed automatically`,
            security: [{ bearerAuth: [] }],
            params: {
                type: 'object',
                required: ['courseId'],
                properties: { courseId: { type: 'string' } },
            },
            response: {
                204: { type: 'null', description: 'Course deleted successfully' },
                403: { type: 'object', properties: { error: { type: 'string' } } },
                404: { type: 'object', properties: { error: { type: 'string' } } },
            },
        },
    }, (req: FastifyRequest<{ Params: { courseId: string } }>, res: FastifyReply) =>
        deleteCourseController.handle(req, res)
    );

    fastify.post('/courses/:courseId/gallery', {
        schema: {
            tags: ['Courses'],
            summary: 'Upload photo to course gallery',
            description: `Adds a photo to the course gallery. Requires JWT token with \`UPDATE_COURSE\` permission.

**Business rules:**
- Send as \`multipart/form-data\` with the file in the \`file\` field
- Optional \`caption\` field for the photo caption
- Returns the \`photoId\` needed to remove the photo via \`DELETE /courses/:courseId/gallery/:photoId\``,
            security: [{ bearerAuth: [] }],
            consumes: ['multipart/form-data'],
            params: {
                type: 'object',
                required: ['courseId'],
                properties: { courseId: { type: 'string' } },
            },
            response: {
                201: {
                    type: 'object',
                    properties: {
                        url: { type: 'string' },
                        photoId: { type: 'string' },
                    },
                },
                400: { type: 'object', properties: { error: { type: 'string' } } },
                403: { type: 'object', properties: { error: { type: 'string' } } },
            },
        },
    }, (req: FastifyRequest<{ Params: { courseId: string } }>, res: FastifyReply) =>
        addCoursePhotoController.handle(req, res)
    );

    fastify.delete('/courses/:courseId/gallery/:photoId', {
        schema: {
            tags: ['Courses'],
            summary: 'Remove photo from course gallery',
            description: `Removes a specific photo from the course gallery. Requires JWT token with \`UPDATE_COURSE\` permission.

**Business rules:**
- Use the \`photoId\` returned by \`POST /courses/:courseId/gallery\`
- The file in storage is **not** removed, only the database record`,
            security: [{ bearerAuth: [] }],
            params: {
                type: 'object',
                required: ['courseId', 'photoId'],
                properties: {
                    courseId: { type: 'string' },
                    photoId: { type: 'string' },
                },
            },
            response: {
                204: { type: 'null', description: 'Photo removed successfully' },
                403: { type: 'object', properties: { error: { type: 'string' } } },
                404: { type: 'object', properties: { error: { type: 'string' } } },
            },
        },
    }, (req: FastifyRequest<{ Params: { courseId: string; photoId: string } }>, res: FastifyReply) =>
        deleteCoursePhotoController.handle(req, res)
    );
}
