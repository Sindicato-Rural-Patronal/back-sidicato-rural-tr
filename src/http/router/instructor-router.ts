import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client/extension';
import { createInstructorAdapter } from '../../adapter/database/instructor-adapter.js';
import { createUserDataAdapter } from '../../adapter/database/user-data.js';
import { createCourseAdapter } from '../../adapter/database/course-adapter.js';
import { createUserAdminAdapter } from '../../adapter/database/user-admin-adapter.js';
import { createRuleAdapter } from '../../adapter/database/rule-adapter.js';
import { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
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

export async function instructorRouter(fastify: FastifyInstance, prisma: PrismaClient) {
    const instructorRepository = createInstructorAdapter(prisma);
    const userDataRepository = createUserDataAdapter(prisma);
    const courseRepository = createCourseAdapter(prisma);
    const userAdminRepository = createUserAdminAdapter(prisma);
    const ruleRepository = createRuleAdapter(prisma);
    const getAdminPermissions = new GetAdminPermissionsUseCase(userAdminRepository, ruleRepository);

    const promoteController = new PromoteToInstructorController(
        new PromoteToInstructorUseCase(instructorRepository, userDataRepository),
        getAdminPermissions,
    );
    const demoteController = new DemoteInstructorController(
        new DemoteInstructorUseCase(instructorRepository),
        getAdminPermissions,
    );
    const listController = new ListInstructorsController(
        new ListInstructorsUseCase(instructorRepository),
        getAdminPermissions,
    );
    const addToCourseController = new AddInstructorToCourseController(
        new AddInstructorToCourseUseCase(instructorRepository, courseRepository),
        getAdminPermissions,
    );
    const removeFromCourseController = new RemoveInstructorFromCourseController(
        new RemoveInstructorFromCourseUseCase(instructorRepository),
        getAdminPermissions,
    );
    const updateInstructorController = new UpdateInstructorController(
        new UpdateInstructorUseCase(instructorRepository),
        getAdminPermissions,
    );

    fastify.post('/admin/users/:id/instructor', {
        schema: {
            tags: ['Instrutores'],
            summary: 'Promover usuário a instrutor',
            security: [{ bearerAuth: [] }],
            params: {
                type: 'object',
                required: ['id'],
                properties: { id: { type: 'string', example: '550e8400-e29b-41d4-a716-446655440000' } },
            },
            body: {
                type: 'object',
                properties: {
                    bio: { type: 'string', example: 'Especialista em agricultura familiar com 10 anos de experiência.' },
                    linkedin: { type: 'string', nullable: true, example: 'https://linkedin.com/in/joao-silva' },
                    instagram: { type: 'string', nullable: true, example: 'https://instagram.com/joao.silva' },
                    facebook: { type: 'string', nullable: true, example: 'https://facebook.com/joao.silva' },
                },
            },
            response: {
                201: { type: 'object', properties: { instructorId: { type: 'string' } } },
                400: { type: 'object', properties: { error: { type: 'string' } } },
                401: { type: 'object', properties: { error: { type: 'string' } } },
                403: { type: 'object', properties: { error: { type: 'string' } } },
                404: { type: 'object', properties: { error: { type: 'string' } } },
                409: { type: 'object', properties: { error: { type: 'string' } } },
            },
        },
    }, (req, res) => promoteController.handle(req as never, res));

    fastify.delete('/admin/users/:id/instructor', {
        schema: {
            tags: ['Instrutores'],
            summary: 'Remover status de instrutor',
            security: [{ bearerAuth: [] }],
            params: {
                type: 'object',
                required: ['id'],
                properties: { id: { type: 'string', example: '550e8400-e29b-41d4-a716-446655440000' } },
            },
            response: {
                204: { type: 'null' },
                401: { type: 'object', properties: { error: { type: 'string' } } },
                403: { type: 'object', properties: { error: { type: 'string' } } },
                404: { type: 'object', properties: { error: { type: 'string' } } },
            },
        },
    }, (req, res) => demoteController.handle(req as never, res));

    fastify.patch('/admin/users/:id/instructor', {
        schema: {
            tags: ['Instrutores'],
            summary: 'Atualizar dados do instrutor',
            description: 'Atualiza bio e/ou redes sociais do instrutor. Todos os campos são opcionais — enviar null limpa o campo.',
            security: [{ bearerAuth: [] }],
            params: {
                type: 'object',
                required: ['id'],
                properties: { id: { type: 'string', example: '550e8400-e29b-41d4-a716-446655440000' } },
            },
            body: {
                type: 'object',
                properties: {
                    bio: { type: 'string', nullable: true, example: 'Especialista em pecuária com 10 anos de experiência.' },
                    linkedin: { type: 'string', nullable: true, example: 'https://linkedin.com/in/joao-silva' },
                    instagram: { type: 'string', nullable: true, example: 'https://instagram.com/joao.silva' },
                    facebook: { type: 'string', nullable: true, example: 'https://facebook.com/joao.silva' },
                },
            },
            response: {
                200: { type: 'object', properties: { message: { type: 'string' } } },
                401: { type: 'object', properties: { error: { type: 'string' } } },
                403: { type: 'object', properties: { error: { type: 'string' } } },
                404: { type: 'object', properties: { error: { type: 'string' } } },
            },
        },
    }, (req, res) => updateInstructorController.handle(req as never, res));

    fastify.get('/admin/instructors', {
        schema: {
            tags: ['Instrutores'],
            summary: 'Listar todos os instrutores',
            security: [{ bearerAuth: [] }],
            querystring: {
                type: 'object',
                properties: {
                    page: { type: 'integer', minimum: 1, default: 1 },
                    limit: { type: 'integer', minimum: 1, maximum: 1000, default: 20 },
                },
            },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        data: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    id: { type: 'string' },
                                    bio: { type: 'string', nullable: true },
                                    linkedin: { type: 'string', nullable: true },
                                    instagram: { type: 'string', nullable: true },
                                    facebook: { type: 'string', nullable: true },
                                    userData: {
                                        type: 'object',
                                        properties: {
                                            id: { type: 'string' },
                                            name: { type: 'string' },
                                        },
                                    },
                                },
                            },
                        },
                        total: { type: 'integer' },
                        page: { type: 'integer' },
                        limit: { type: 'integer' },
                        totalPages: { type: 'integer' },
                    },
                },
                401: { type: 'object', properties: { error: { type: 'string' } } },
                403: { type: 'object', properties: { error: { type: 'string' } } },
            },
        },
    }, (req, res) => listController.handle(req as Parameters<typeof listController.handle>[0], res));

    fastify.post('/admin/courses/:courseId/instructors', {
        schema: {
            tags: ['Instrutores'],
            summary: 'Vincular instrutor a curso',
            security: [{ bearerAuth: [] }],
            params: {
                type: 'object',
                required: ['courseId'],
                properties: { courseId: { type: 'string', example: '550e8400-e29b-41d4-a716-446655440002' } },
            },
            body: {
                type: 'object',
                required: ['instructorUserDataId'],
                properties: {
                    instructorUserDataId: { type: 'string', example: '550e8400-e29b-41d4-a716-446655440000' },
                    title: { type: 'string', example: 'Engenheiro Agrônomo' },
                    category: { type: 'string', example: 'Técnico' },
                },
            },
            response: {
                201: { type: 'object', properties: { assignmentId: { type: 'string' } } },
                400: { type: 'object', properties: { error: { type: 'string' } } },
                401: { type: 'object', properties: { error: { type: 'string' } } },
                403: { type: 'object', properties: { error: { type: 'string' } } },
                404: { type: 'object', properties: { error: { type: 'string' } } },
                409: { type: 'object', properties: { error: { type: 'string' } } },
            },
        },
    }, (req, res) => addToCourseController.handle(req as never, res));

    fastify.delete('/admin/courses/:courseId/instructors/:assignmentId', {
        schema: {
            tags: ['Instrutores'],
            summary: 'Desvincular instrutor de curso',
            security: [{ bearerAuth: [] }],
            params: {
                type: 'object',
                required: ['courseId', 'assignmentId'],
                properties: {
                    courseId: { type: 'string', example: '550e8400-e29b-41d4-a716-446655440002' },
                    assignmentId: { type: 'string', example: '550e8400-e29b-41d4-a716-446655440003' },
                },
            },
            response: {
                204: { type: 'null' },
                401: { type: 'object', properties: { error: { type: 'string' } } },
                403: { type: 'object', properties: { error: { type: 'string' } } },
                404: { type: 'object', properties: { error: { type: 'string' } } },
            },
        },
    }, (req, res) => removeFromCourseController.handle(req as never, res));
}
