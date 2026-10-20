import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { createInstructorAdapter } from '../../adapter/database/instructor-adapter.js';
import { createUserDataAdapter } from '../../adapter/database/user-data.js';
import { createCourseAdapter } from '../../adapter/database/course-adapter.js';
import { PromoteToInstructorUseCase } from '../../usecase/promote-to-instructor.js';
import { DemoteInstructorUseCase } from '../../usecase/demote-instructor.js';
import { ListInstructorsUseCase } from '../../usecase/list-instructors.js';
import { AddInstructorToCourseUseCase } from '../../usecase/add-instructor-to-course.js';
import { RemoveInstructorFromCourseUseCase } from '../../usecase/remove-instructor-from-course.js';
import { PromoteToInstructorController } from '../controllers/promote-to-instructor.js';
import { DemoteInstructorController } from '../controllers/demote-instructor.js';
import { ListInstructorsController } from '../controllers/list-instructors.js';
import { AddInstructorToCourseController } from '../controllers/add-instructor-to-course.js';
import { RemoveInstructorFromCourseController } from '../controllers/remove-instructor-from-course.js';
import { UpdateInstructorController } from '../controllers/update-instructor.js';
import { UpdateInstructorUseCase } from '../../usecase/update-instructor.js';
import { errorResponse, paginationQuerystring, pagedResponse } from '../lib/swagger-schemas.js';
import { requires } from '../lib/route-auth.js';

export async function instructorRouter(fastify: FastifyInstance, prisma: PrismaClient) {
    const instructorRepository = createInstructorAdapter(prisma);
    const userDataRepository = createUserDataAdapter(prisma);
    const courseRepository = createCourseAdapter(prisma);

    const promoteController = new PromoteToInstructorController(
        new PromoteToInstructorUseCase(instructorRepository, userDataRepository),
    );
    const demoteController = new DemoteInstructorController(
        new DemoteInstructorUseCase(instructorRepository),
    );
    const listController = new ListInstructorsController(
        new ListInstructorsUseCase(instructorRepository),
    );
    const addToCourseController = new AddInstructorToCourseController(
        new AddInstructorToCourseUseCase(instructorRepository, courseRepository),
    );
    const removeFromCourseController = new RemoveInstructorFromCourseController(
        new RemoveInstructorFromCourseUseCase(instructorRepository),
    );
    const updateInstructorController = new UpdateInstructorController(
        new UpdateInstructorUseCase(instructorRepository),
    );

    fastify.post('/admin/users/:id/instructor', {
        config: { auth: requires('UPDATE_USER') },
        schema: {
            tags: ['Instrutores'],
            summary: 'Promover usuário a instrutor',
            params: {
                type: 'object',
                required: ['id'],
                properties: { id: { type: 'string',
example: '550e8400-e29b-41d4-a716-446655440000' } },
            },
            body: {
                type: 'object',
                properties: {
                    bio: { type: 'string',
example: 'Especialista em agricultura familiar com 10 anos de experiência.' },
                    linkedin: { type: 'string',
nullable: true,
example: 'https://linkedin.com/in/joao-silva' },
                    instagram: { type: 'string',
nullable: true,
example: 'https://instagram.com/joao.silva' },
                    facebook: { type: 'string',
nullable: true,
example: 'https://facebook.com/joao.silva' },
                },
            },
            response: {
                201: { type: 'object',
properties: { instructorId: { type: 'string' } } },
                400: errorResponse,
                401: errorResponse,
                403: errorResponse,
                404: errorResponse,
                409: errorResponse,
            },
        },
    }, (req, res) => promoteController.handle(req as never, res));

    fastify.delete('/admin/users/:id/instructor', {
        config: { auth: requires('UPDATE_USER') },
        schema: {
            tags: ['Instrutores'],
            summary: 'Remover status de instrutor',
            params: {
                type: 'object',
                required: ['id'],
                properties: { id: { type: 'string',
example: '550e8400-e29b-41d4-a716-446655440000' } },
            },
            response: {
                204: { type: 'null' },
                401: errorResponse,
                403: errorResponse,
                404: errorResponse,
            },
        },
    }, (req, res) => demoteController.handle(req as never, res));

    fastify.patch('/admin/users/:id/instructor', {
        config: { auth: requires('UPDATE_USER') },
        schema: {
            tags: ['Instrutores'],
            summary: 'Atualizar dados do instrutor',
            description: 'Atualiza bio e/ou redes sociais do instrutor. Todos os campos são opcionais — enviar null limpa o campo.',
            params: {
                type: 'object',
                required: ['id'],
                properties: { id: { type: 'string',
example: '550e8400-e29b-41d4-a716-446655440000' } },
            },
            body: {
                type: 'object',
                properties: {
                    bio: { type: 'string',
nullable: true,
example: 'Especialista em pecuária com 10 anos de experiência.' },
                    linkedin: { type: 'string',
nullable: true,
example: 'https://linkedin.com/in/joao-silva' },
                    instagram: { type: 'string',
nullable: true,
example: 'https://instagram.com/joao.silva' },
                    facebook: { type: 'string',
nullable: true,
example: 'https://facebook.com/joao.silva' },
                },
            },
            response: {
                200: { type: 'object',
properties: { message: { type: 'string' } } },
                401: errorResponse,
                403: errorResponse,
                404: errorResponse,
            },
        },
    }, (req, res) => updateInstructorController.handle(req as never, res));

    fastify.get('/admin/instructors', {
        config: { auth: requires('READ_USER') },
        schema: {
            tags: ['Instrutores'],
            summary: 'Listar todos os instrutores',
            querystring: paginationQuerystring,
            response: {
                200: pagedResponse({
                                type: 'object',
                                properties: {
                                    id: { type: 'string' },
                                    bio: { type: 'string',
nullable: true },
                                    linkedin: { type: 'string',
nullable: true },
                                    instagram: { type: 'string',
nullable: true },
                                    facebook: { type: 'string',
nullable: true },
                                    userData: {
                                        type: 'object',
                                        properties: {
                                            id: { type: 'string' },
                                            name: { type: 'string' },
                                        },
                                    },
                                },
                            }),
                401: errorResponse,
                403: errorResponse,
            },
        },
    }, (req, res) => listController.handle(req as Parameters<typeof listController.handle>[0], res));

    fastify.post('/admin/courses/:courseId/instructors', {
        config: { auth: requires('UPDATE_COURSE') },
        schema: {
            tags: ['Instrutores'],
            summary: 'Vincular instrutor a curso',
            params: {
                type: 'object',
                required: ['courseId'],
                properties: { courseId: { type: 'string',
example: '550e8400-e29b-41d4-a716-446655440002' } },
            },
            body: {
                type: 'object',
                required: ['instructorUserDataId'],
                properties: {
                    instructorUserDataId: { type: 'string',
example: '550e8400-e29b-41d4-a716-446655440000' },
                    title: { type: 'string',
example: 'Engenheiro Agrônomo' },
                    category: { type: 'string',
example: 'Técnico' },
                },
            },
            response: {
                201: { type: 'object',
properties: { assignmentId: { type: 'string' } } },
                400: errorResponse,
                401: errorResponse,
                403: errorResponse,
                404: errorResponse,
                409: errorResponse,
            },
        },
    }, (req, res) => addToCourseController.handle(req as never, res));

    fastify.delete('/admin/courses/:courseId/instructors/:assignmentId', {
        config: { auth: requires('UPDATE_COURSE') },
        schema: {
            tags: ['Instrutores'],
            summary: 'Desvincular instrutor de curso',
            params: {
                type: 'object',
                required: ['courseId', 'assignmentId'],
                properties: {
                    courseId: { type: 'string',
example: '550e8400-e29b-41d4-a716-446655440002' },
                    assignmentId: { type: 'string',
example: '550e8400-e29b-41d4-a716-446655440003' },
                },
            },
            response: {
                204: { type: 'null' },
                401: errorResponse,
                403: errorResponse,
                404: errorResponse,
            },
        },
    }, (req, res) => removeFromCourseController.handle(req as never, res));
}
