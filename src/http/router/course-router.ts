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
import { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';

const paginationQuerySchema = {
    type: 'object',
    properties: {
        page: { type: 'integer',
minimum: 1,
default: 1 },
        limit: { type: 'integer',
minimum: 1,
maximum: 1000,
default: 20 },
    },
} as const;

const pagedResponseSchema = (itemSchema: object) => ({
    type: 'object',
    properties: {
        data: { type: 'array',
items: itemSchema },
        total: { type: 'integer' },
        page: { type: 'integer' },
        limit: { type: 'integer' },
        totalPages: { type: 'integer' },
    },
});

const courseDetailProperties = {
    id: { type: 'string', example: '550e8400-e29b-41d4-a716-446655440000' },
    status: { type: 'string', enum: ['PUBLIC', 'PRIVATE', 'UNPUBLISHED'], example: 'PUBLIC' },
    title: { type: 'string', example: 'Manejo de Pastagem' },
    description: { type: 'string', example: 'Técnicas modernas de manejo de pastagem para bovinos.' },
    maxStudents: { type: 'integer', example: 30 },
    minStudents: { type: 'integer', example: 5 },
    enrolled: { type: 'integer', example: 12 },
    preEnrolled: { type: 'integer', example: 0 },
    waitlist: { type: 'integer', example: 0 },
    coverImage: { type: 'string', nullable: true, example: 'https://storage.example.com/banners/curso-01.jpg' },
    price: { type: 'number', example: 150.00 },
    startDate: { type: 'string', example: '2026-08-10' },
    endDate: { type: 'string', example: '2026-08-12' },
    startTime: { type: 'string', example: '2026-08-10T09:00:00-03:00' },
    endTime: { type: 'string', example: '2026-08-12T17:00:00-03:00' },
    workloadHours: { type: 'integer', example: 16 },
    location: { type: 'string', example: 'Sala A — Sede do Sindicato' },
    instructorName: { type: 'string', example: 'Dr. Carlos Mendes' },
    instructors: {
        type: 'array',
        items: {
            type: 'object',
            properties: {
                id: { type: 'string' },
                title: { type: 'string', nullable: true, example: 'Engenheiro Agrônomo' },
                category: { type: 'string', nullable: true, example: 'Técnico' },
                name: { type: 'string', example: 'Dr. Carlos Mendes' },
                bio: { type: 'string', nullable: true, example: 'Especialista em pecuária com 10 anos de experiência.' },
                avatar: { type: 'string', nullable: true },
                linkedin: { type: 'string', nullable: true, example: 'https://linkedin.com/in/joao-silva' },
                instagram: { type: 'string', nullable: true, example: 'https://instagram.com/joao.silva' },
                facebook: { type: 'string', nullable: true, example: 'https://facebook.com/joao.silva' },
            },
        },
    },
    registrationDeadline: { type: 'string', nullable: true, example: '2026-08-05T23:59:00-03:00' },
    observations: { type: 'string', nullable: true, example: 'Trazer botas e protetor solar.' },
    eventNumber: { type: 'string', nullable: true, example: 'EVT-2026-042' },
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
    const getAdminPermissions = new GetAdminPermissionsUseCase(userAdminRepository, ruleRepository);

    const createCourseController = new CreateCourseController(
        new CreateCourseUseCase(courseRepository, roomRepository),
        getAdminPermissions,
    );
    const uploadBannerController = new UploadBannerCourseController(
        new UploadCourseBannerUseCase(storage, courseRepository),
        getAdminPermissions,
    );
    const getCourseDetailController = new GetCourseDetailController(
        new GetCourseDetailUseCase(courseRepository),
    );
    const listCoursesController = new ListCoursesController(
        new ListCoursesUseCase(courseRepository),
    );
    const listAllCoursesController = new ListAllCoursesController(
        new ListAllCoursesUseCase(courseRepository),
        getAdminPermissions,
    );
    const updateCourseController = new UpdateCourseController(
        new UpdateCourseUseCase(courseRepository, roomRepository),
        getAdminPermissions,
    );
    const deleteCourseController = new DeleteCourseController(
        new DeleteCourseUseCase(courseRepository),
        getAdminPermissions,
    );
    const addCoursePhotoController = new AddCoursePhotoController(
        new AddCoursePhotoUseCase(courseRepository, storage),
        getAdminPermissions,
    );
    const deleteCoursePhotoController = new DeleteCoursePhotoController(
        new DeleteCoursePhotoUseCase(courseRepository),
        getAdminPermissions,
    );
    const getAdminCourseDetailController = new GetAdminCourseDetailController(
        new GetAdminCourseDetailUseCase(courseRepository),
        getAdminPermissions,
    );

    fastify.get(
        '/admin/courses',
        {
            schema: {
                tags: ['Admin — Courses'],
                summary: 'List all courses (card listing)',
                description: `Returns **all** courses with minimal card data. Requires JWT token with \`READ_COURSE\` permission. Use \`GET /admin/courses/:courseId\` for full detail.`,
                security: [{ bearerAuth: [] }],
                querystring: {
                    type: 'object',
                    properties: {
                        page: { type: 'integer', minimum: 1, default: 1 },
                        limit: { type: 'integer', minimum: 1, maximum: 1000, default: 20 },
                        status: { type: 'string', enum: ['PUBLIC', 'PRIVATE', 'UNPUBLISHED'], description: 'Filtrar por status' },
                        search: { type: 'string', description: 'Busca por nome do curso' },
                    },
                },
                response: {
                    200: pagedResponseSchema({
                        type: 'object',
                        properties: {
                            id: { type: 'string' },
                            status: {
                                type: 'string',
                                enum: ['PUBLIC', 'PRIVATE', 'UNPUBLISHED'],
                            },
                            title: { type: 'string' },
                            eventNumber: { type: 'string',
nullable: true },
                            startDate: { type: 'string' },
                            enrolled: { type: 'integer' },
                            maxStudents: { type: 'integer' },
                            price: { type: 'number' },
                            coverImage: { type: 'string',
nullable: true },
                            photoCount: { type: 'integer' },
                        },
                    }),
                    401: { type: 'object',
properties: { error: { type: 'string' } } },
                    403: { type: 'object',
properties: { error: { type: 'string' } } },
                },
            },
        },
        (req: FastifyRequest, res: FastifyReply) => listAllCoursesController.handle(req, res),
    );

    fastify.get(
        '/admin/courses/:courseId',
        {
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
                    200: { type: 'object',
properties: courseDetailProperties },
                    401: { type: 'object',
properties: { error: { type: 'string' } } },
                    403: { type: 'object',
properties: { error: { type: 'string' } } },
                    404: { type: 'object',
properties: { error: { type: 'string' } } },
                },
            },
        },
        (req: FastifyRequest<{ Params: { courseId: string } }>, res: FastifyReply) =>
            getAdminCourseDetailController.handle(req, res),
    );

    fastify.get(
        '/courses',
        {
            schema: {
                tags: ['Courses'],
                summary: 'List courses',
                description: `Returns all **public** courses. Ordered by start date (nearest first).`,
                querystring: paginationQuerySchema,
                response: {
                    200: pagedResponseSchema({
                        type: 'object',
                        properties: courseDetailProperties,
                    }),
                },
            },
        },
        (req: FastifyRequest, res: FastifyReply) => listCoursesController.handle(req, res),
    );

    fastify.get(
        '/courses/:courseId',
        {
            schema: {
                tags: ['Courses'],
                summary: 'Course detail',
                description: `Returns the full detail of a course by its ID.

**Business rules:**
- Returns **any** status (\`PUBLIC\`, \`PRIVATE\`, \`UNPUBLISHED\`) — ideal for detail pages with direct links
- The \`status\` field indicates visibility: \`PUBLIC\` appears in listings, others only via direct URL
- \`maxStudents\` = room capacity; \`enrolled\` = current number of registrations
- Returns 404 if the course does not exist`,
                params: {
                    type: 'object',
                    required: ['courseId'],
                    properties: { courseId: { type: 'string' } },
                },
                response: {
                    200: { type: 'object',
properties: courseDetailProperties },
                    404: { type: 'object',
properties: { error: { type: 'string' } } },
                },
            },
        },
        (req: FastifyRequest<{ Params: { courseId: string } }>, res: FastifyReply) =>
            getCourseDetailController.handle(req, res),
    );

    fastify.post(
        '/courses',
        {
            schema: {
                tags: ['Courses'],
                summary: 'Create course',
                description: `Creates a new course. Requires JWT token with \`CREATE_COURSE\` permission.

**Business rules:**
- \`roomId\` must be the ID of an existing room (from \`GET /rooms\`) — a course requires a room
- **Maximum enrollment capacity** is automatically inherited from \`room.maxCapacity\`; it is not set on the course
- **Scheduling conflict:** if the room already has another course whose period overlaps (\`startTime\`–\`endTime\`), creation is rejected with 400
- \`status\` controls visibility:
  - \`UNPUBLISHED\` (default) — draft, does not appear in listings
  - \`PRIVATE\` — accessible via direct link, not in the public listing
  - \`PUBLIC\` — appears in \`GET /courses\`
- \`startTime\` and \`endTime\` are ISO 8601 with timezone (e.g. \`2025-08-10T09:00:00-03:00\`)
- \`registrationDeadline\` optional — enrollment cutoff date (also ISO 8601)
- \`price\` in BRL (float); \`workloadHours\` in whole hours`,
                security: [{ bearerAuth: [] }],
                body: {
                    type: 'object',
                    required: ['name', 'description', 'roomId', 'startTime', 'endTime'],
                    properties: {
                        name: { type: 'string', example: 'Manejo de Pastagem' },
                        description: { type: 'string', example: 'Técnicas modernas de manejo de pastagem para bovinos.' },
                        roomId: { type: 'string', format: 'uuid', example: '550e8400-e29b-41d4-a716-446655440010' },
                        status: { type: 'string', enum: ['PUBLIC', 'PRIVATE', 'UNPUBLISHED'], example: 'UNPUBLISHED' },
                        startTime: { type: 'string', format: 'date-time', example: '2026-08-10T09:00:00-03:00' },
                        endTime: { type: 'string', format: 'date-time', example: '2026-08-12T17:00:00-03:00' },
                        price: { type: 'number', minimum: 0, example: 150.00 },
                        workloadHours: { type: 'integer', minimum: 0, example: 16 },
                        registrationDeadline: { type: 'string', format: 'date-time', example: '2026-08-05T23:59:00-03:00' },
                        observations: { type: 'string', example: 'Trazer botas e protetor solar.' },
                    },
                },
                response: {
                    201: { type: 'object', properties: { id: { type: 'string' } } },
                    400: { type: 'object', properties: { error: { type: 'string' } } },
                    401: { type: 'object', properties: { error: { type: 'string' } } },
                    403: { type: 'object', properties: { error: { type: 'string' } } },
                },
            },
        },
        (req: FastifyRequest, res: FastifyReply) => createCourseController.handle(req, res),
    );

    fastify.post(
        '/courses/:courseId/banner',
        {
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
                    401: { type: 'object', properties: { error: { type: 'string' } } },
                    403: { type: 'object', properties: { error: { type: 'string' } } },
                    404: { type: 'object', properties: { error: { type: 'string' } } },
                },
            },
        },
        (req: FastifyRequest<{ Params: { courseId: string } }>, res: FastifyReply) =>
            uploadBannerController.handle(req, res),
    );

    fastify.patch(
        '/courses/:courseId',
        {
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
                        name: { type: 'string', example: 'Manejo de Pastagem' },
                        description: { type: 'string', example: 'Técnicas modernas de manejo de pastagem para bovinos.' },
                        roomId: { type: 'string', format: 'uuid', example: '550e8400-e29b-41d4-a716-446655440010' },
                        status: { type: 'string', enum: ['PUBLIC', 'PRIVATE', 'UNPUBLISHED'], example: 'PUBLIC' },
                        startTime: { type: 'string', format: 'date-time', example: '2026-08-10T09:00:00-03:00' },
                        endTime: { type: 'string', format: 'date-time', example: '2026-08-12T17:00:00-03:00' },
                        price: { type: 'number', minimum: 0, example: 150.00 },
                        workloadHours: { type: 'integer', minimum: 0, example: 16 },
                        registrationDeadline: {
                            type: 'string',
                            format: 'date-time',
                            nullable: true,
                            example: '2026-08-05T23:59:00-03:00',
                        },
                        observations: { type: 'string', example: 'Trazer botas e protetor solar.' },
                        eventNumber: { type: 'string', example: 'EVT-2026-042' },
                        minStudents: { type: 'integer', minimum: 0, example: 5 },
                        preEnrolled: { type: 'integer', minimum: 0, example: 0 },
                        waitlist: { type: 'integer', minimum: 0, example: 0 },
                    },
                },
                response: {
                    200: { type: 'object', properties: { message: { type: 'string' } } },
                    400: { type: 'object', properties: { error: { type: 'string' } } },
                    401: { type: 'object', properties: { error: { type: 'string' } } },
                    403: { type: 'object', properties: { error: { type: 'string' } } },
                    404: { type: 'object', properties: { error: { type: 'string' } } },
                },
            },
        },
        (req: FastifyRequest<{ Params: { courseId: string } }>, res: FastifyReply) =>
            updateCourseController.handle(req, res),
    );

    fastify.delete(
        '/courses/:courseId',
        {
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
                    401: { type: 'object', properties: { error: { type: 'string' } } },
                    403: { type: 'object', properties: { error: { type: 'string' } } },
                    404: { type: 'object', properties: { error: { type: 'string' } } },
                },
            },
        },
        (req: FastifyRequest<{ Params: { courseId: string } }>, res: FastifyReply) =>
            deleteCourseController.handle(req, res),
    );

    fastify.post(
        '/courses/:courseId/gallery',
        {
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
                    401: { type: 'object', properties: { error: { type: 'string' } } },
                    403: { type: 'object', properties: { error: { type: 'string' } } },
                },
            },
        },
        (req: FastifyRequest<{ Params: { courseId: string } }>, res: FastifyReply) =>
            addCoursePhotoController.handle(req, res),
    );

    fastify.delete(
        '/courses/:courseId/gallery/:photoId',
        {
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
                    401: { type: 'object', properties: { error: { type: 'string' } } },
                    403: { type: 'object', properties: { error: { type: 'string' } } },
                    404: { type: 'object', properties: { error: { type: 'string' } } },
                },
            },
        },
        (
            req: FastifyRequest<{
                Params: {
                    courseId: string;
                    photoId: string;
                };
            }>,
            res: FastifyReply,
        ) => deleteCoursePhotoController.handle(req, res),
    );
}
