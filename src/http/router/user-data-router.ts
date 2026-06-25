import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { CreateUserController } from '../controllers/create-user.js';
import { CreateUserUseCase } from '../../usecase/create-user-data.js';
import { createUserDataAdapter } from '../../adapter/database/user-data.js';
import type { PrismaClient } from '@prisma/client/extension';
import { ListUsersController } from '../controllers/list-users.js';
import { ListUsersUseCase } from '../../usecase/list-users.js';
import { createUserAdminAdapter } from '../../adapter/database/user-admin-adapter.js';
import { createRuleAdapter } from '../../adapter/database/rule-adapter.js';
import { UpdateUserController } from '../controllers/update-user.js';
import { UpdateUserDataUseCase } from '../../usecase/update-user-data.js';
import { DeleteUserController } from '../controllers/delete-user.js';
import { DeleteUserDataUseCase } from '../../usecase/delete-user-data.js';
import { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import { GetUserDetailController } from '../controllers/get-user-detail.js';
import { GetUserDetailUseCase } from '../../usecase/get-user-detail.js';
import { UploadAvatarController } from '../controllers/upload-avatar.js';
import { UploadAvatarUseCase } from '../../usecase/upload-avatar.js';
import { createStorageAdapter } from '../../adapter/storage/factory.js';
import { requirePermission } from '../lib/require-permission.js';
import { ListPartnersController } from '../controllers/list-partners.js';
import { ListPartnersUseCase } from '../../usecase/list-partners.js';
import { ReorderPartnersController } from '../controllers/reorder-partners.js';
import { ReorderPartnersUseCase } from '../../usecase/reorder-partners.js';
import { UploadPartnerLogoController } from '../controllers/upload-partner-logo.js';
import { UploadPartnerLogoUseCase } from '../../usecase/upload-partner-logo.js';
import { createInstructorAdapter } from '../../adapter/database/instructor-adapter.js';
import { UpdateInstructorUseCase } from '../../usecase/update-instructor.js';

export async function userDataRouter(fastify: FastifyInstance, prisma: PrismaClient) {
    const userRepository = createUserDataAdapter(prisma);
    const userAdminRepository = createUserAdminAdapter(prisma);
    const ruleRepository = createRuleAdapter(prisma);
    const getAdminPermissions = new GetAdminPermissionsUseCase(userAdminRepository, ruleRepository);
    const instructorRepository = createInstructorAdapter(prisma);

    const createUserController = new CreateUserController(new CreateUserUseCase(userRepository));
    const listUsersController = new ListUsersController(
        new ListUsersUseCase(userRepository),
        getAdminPermissions,
    );
    const updateUserController = new UpdateUserController(
        new UpdateUserDataUseCase(userRepository),
        getAdminPermissions,
        new UpdateInstructorUseCase(instructorRepository),
    );
    const deleteUserController = new DeleteUserController(
        new DeleteUserDataUseCase(userRepository),
        getAdminPermissions,
    );
    const getUserDetailController = new GetUserDetailController(
        new GetUserDetailUseCase(userRepository),
        getAdminPermissions,
    );
    const uploadAvatarController = new UploadAvatarController(
        new UploadAvatarUseCase(createStorageAdapter(), userRepository),
        getAdminPermissions,
    );
    const listPartnersController = new ListPartnersController(new ListPartnersUseCase(userRepository));
    const reorderPartnersController = new ReorderPartnersController(new ReorderPartnersUseCase(userRepository));
    const uploadPartnerLogoController = new UploadPartnerLogoController(
        new UploadPartnerLogoUseCase(createStorageAdapter(), userRepository),
    );

    fastify.get(
        '/admin/users',
        {
            schema: {
                tags: ['Admin — Users'],
                summary: 'List workers (internal)',
                security: [{ bearerAuth: [] }],
                querystring: {
                    type: 'object',
                    properties: {
                        page: { type: 'integer',
minimum: 1,
default: 1 },
                        limit: { type: 'integer',
minimum: 1,
maximum: 1000,
default: 20 },
                        search: { type: 'string',
description: 'Busca em nome, email e CPF' },
                        memberType: { type: 'string',
description: 'Tipo de membro (exact match)' },
                        memberClassification: { type: 'string',
description: 'Classificação do membro (exact match)' },
                        gender: { type: 'string',
enum: ['MALE', 'FEMALE', 'OTHER'],
description: 'Gênero' },
                        ethnicity: { type: 'string',
enum: ['WHITE', 'BLACK', 'MIXED', 'ASIAN', 'INDIGENOUS'],
description: 'Etnia' },
                        educationLevel: { type: 'string',
enum: ['NO_FORMAL_EDUCATION', 'INCOMPLETE_PRIMARY', 'COMPLETE_PRIMARY', 'INCOMPLETE_SECONDARY', 'COMPLETE_SECONDARY', 'INCOMPLETE_HIGHER', 'COMPLETE_HIGHER', 'POSTGRADUATE'],
description: 'Nível de escolaridade' },
                        incompleteRegistration: { type: 'boolean',
description: 'true = só cadastros incompletos (sem avatar, sem propriedades, cpf, rg, birthDate ou gender nulos) | false = só cadastros completos' },
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
                                        name: { type: 'string' },
                                        email: { type: 'string' },
                                        phone: { type: 'string' },
                                        cpf: { type: 'string',
nullable: true },
                                        cnpj: { type: 'string',
nullable: true },
                                        avatar: { type: 'string',
nullable: true },
                                        rg: { type: 'string',
nullable: true },
                                        birthDate: { type: 'string',
nullable: true },
                                        gender: { type: 'string',
nullable: true },
                                        memberStatus: { type: 'string',
nullable: true },
                                        memberType: { type: 'string',
nullable: true },
                                        memberClassification: { type: 'string',
nullable: true },
                                        createdAt: { type: 'string' },
                                        updatedAt: { type: 'string' },
                                    },
                                },
                            },
                            total: { type: 'integer' },
                            page: { type: 'integer' },
                            limit: { type: 'integer' },
                            totalPages: { type: 'integer' },
                        },
                    },
                    403: { type: 'object',
properties: { error: { type: 'string' } } },
                },
            },
        },
        (req: FastifyRequest, res: FastifyReply) => listUsersController.handle(req, res),
    );

    fastify.get(
        '/admin/users/:id',
        {
            schema: {
                tags: ['Admin — Users'],
                summary: 'Get worker detail with relations and properties',
                security: [{ bearerAuth: [] }],
                params: {
                    type: 'object',
                    properties: { id: { type: 'string' } },
                    required: ['id'],
                },
                response: {
                    200: {
                        type: 'object',
                        properties: {
                            id: { type: 'string' },
                            name: { type: 'string' },
                            email: { type: 'string' },
                            phone: { type: 'string' },
                            cpf: { type: 'string',
nullable: true },
                            cnpj: { type: 'string',
nullable: true },
                            avatar: { type: 'string',
nullable: true },
                            nickname: { type: 'string',
nullable: true },
                            maritalStatus: { type: 'string',
nullable: true },
                            phone2: { type: 'string',
nullable: true },
                            phone3: { type: 'string',
nullable: true },
                            rg: { type: 'string',
nullable: true },
                            rgIssuer: { type: 'string',
nullable: true },
                            rgIssuedAt: { type: 'string',
nullable: true },
                            birthDate: { type: 'string',
nullable: true },
                            driverLicense: { type: 'string',
nullable: true },
                            driverLicenseCategory: { type: 'string',
nullable: true },
                            birthPlace: { type: 'string',
nullable: true },
                            nationality: { type: 'string',
nullable: true },
                            gender: { type: 'string',
nullable: true },
                            ethnicity: { type: 'string',
nullable: true },
                            educationLevel: { type: 'string',
nullable: true },
                            functionalCategory: { type: 'string',
nullable: true },
                            specialNeeds: { type: 'boolean' },
                            memberClassification: { type: 'string',
nullable: true },
                            cadPro: { type: 'string',
nullable: true },
                            familyIncome: { type: 'string',
nullable: true },
                            memberType: { type: 'string',
nullable: true },
                            boardPosition: { type: 'string',
nullable: true },
                            boardMember: { type: 'boolean' },
                            memberStatus: { type: 'string',
nullable: true },
                            memberSince: { type: 'string',
nullable: true },
                            memberNotes: { type: 'string',
nullable: true },
                            memberNotesNumber: { type: 'string',
nullable: true },
                            isPartner: { type: 'boolean' },
                            partnerUrl: { type: 'string',
nullable: true },
                            partnerLogo: { type: 'string',
nullable: true },
                            partnerOrder: { type: 'integer',
nullable: true },
                            createdAt: { type: 'string' },
                            updatedAt: { type: 'string' },
                            relations: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        id: { type: 'string' },
                                        label: { type: 'string',
nullable: true },
                                        createdAt: { type: 'string' },
                                        target: {
                                            type: 'object',
                                            properties: {
                                                id: { type: 'string' },
                                                name: { type: 'string' },
                                                cpf: { type: 'string',
nullable: true },
                                            },
                                        },
                                    },
                                },
                            },
                            properties: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        id: { type: 'string' },
                                        name: { type: 'string' },
                                        registration: { type: 'string',
nullable: true },
                                        createdAt: { type: 'string' },
                                        updatedAt: { type: 'string' },
                                        address: {
                                            type: 'object',
                                            nullable: true,
                                            properties: {
                                                id: { type: 'string' },
                                                type: { type: 'string' },
                                                city: { type: 'string',
nullable: true },
                                                state: { type: 'string',
nullable: true },
                                                zipCode: { type: 'string',
nullable: true },
                                                street: { type: 'string',
nullable: true },
                                                number: { type: 'string',
nullable: true },
                                                neighborhood: { type: 'string',
nullable: true },
                                                localityName: { type: 'string',
nullable: true },
                                                road: { type: 'string',
nullable: true },
                                                km: { type: 'string',
nullable: true },
                                                lot: { type: 'string',
nullable: true },
                                                section: { type: 'string',
nullable: true },
                                            },
                                        },
                                    },
                                },
                            },
                            userInstructor: {
                                type: 'object',
                                nullable: true,
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
                                },
                            },
                        },
                    },
                    401: { type: 'object',
properties: { error: { type: 'string' } } },
                    403: { type: 'object',
properties: { error: { type: 'string' } } },
                    404: { type: 'object',
properties: { error: { type: 'string' } } },
                },
            },
        },
        (req: FastifyRequest, res: FastifyReply) =>
            getUserDetailController.handle(
                req as Parameters<typeof getUserDetailController.handle>[0],
                res,
            ),
    );

    fastify.post(
        '/users',
        {
            preValidation: async (req: FastifyRequest) => {
                req.log.info({ body: req.body }, '[POST /users] raw body before schema validation');
            },
            schema: {
                tags: ['Users'],
                summary: 'Create worker user',
                description: `Creates a new UserData (rural worker). Public route — no authentication required.

**Business rules:**
- \`cpf\` must be unique per user — returns 409 if the CPF is already registered
- \`email\` and \`phone\` may be shared across multiple users
- This record represents the rural worker; to have admin access, a \`UserAdmin\` linked to this record must be created (via \`POST /admin/users\`)
- The \`cnpj\` field is optional (for legal-entity rural producers)`,
                body: {
                    type: 'object',
                    required: ['name', 'email', 'phone', 'cpf'],
                    properties: {
                        name: { type: 'string',
example: 'João da Silva' },
                        email: { type: 'string',
format: 'email',
example: 'joao@example.com' },
                        phone: { type: 'string',
example: '44999990001' },
                        cpf: { type: 'string',
example: '52998224725' },
                    },
                },
                response: {
                    201: {
                        description: 'User created successfully',
                        type: 'object',
                        properties: {
                            id: { type: 'string' },
                            name: { type: 'string' },
                            email: { type: 'string' },
                            phone: { type: 'string' },
                            cpf: { type: 'string' },
                            createdAt: { type: 'string',
format: 'date-time' },
                        },
                    },
                    409: {
                        description: 'Email or phone already registered',
                        type: 'object',
                        properties: { error: { type: 'string' } },
                    },
                    500: {
                        description: 'Internal error creating user',
                        type: 'object',
                        properties: { error: { type: 'string' } },
                    },
                },
            },
        },
        (req: FastifyRequest, res: FastifyReply) => createUserController.handle(req, res),
    );

    fastify.patch(
        '/users/:id',
        {
            schema: {
                tags: ['Users'],
                summary: 'Update worker user',
                security: [{ bearerAuth: [] }],
                params: {
                    type: 'object',
                    properties: { id: { type: 'string' } },
                    required: ['id'],
                },
                body: {
                    type: 'object',
                    properties: {
                        name: { type: 'string' },
                        email: { type: 'string',
format: 'email' },
                        phone: { type: 'string' },
                        cpf: { type: 'string',
nullable: true },
                        cnpj: { type: 'string',
nullable: true },
                        avatar: { type: 'string',
nullable: true },
                        nickname: { type: 'string',
nullable: true },
                        maritalStatus: { type: 'string',
nullable: true },
                        phone2: { type: 'string',
nullable: true },
                        phone3: { type: 'string',
nullable: true },
                        rg: { type: 'string',
nullable: true },
                        rgIssuer: { type: 'string',
nullable: true },
                        rgIssuedAt: { type: 'string',
nullable: true },
                        birthDate: { type: 'string',
nullable: true },
                        driverLicense: { type: 'string',
nullable: true },
                        driverLicenseCategory: { type: 'string',
nullable: true },
                        birthPlace: { type: 'string',
nullable: true },
                        nationality: { type: 'string',
nullable: true },
                        gender: { type: 'string',
nullable: true },
                        ethnicity: { type: 'string',
nullable: true },
                        educationLevel: { type: 'string',
nullable: true },
                        functionalCategory: { type: 'string',
nullable: true },
                        specialNeeds: { type: 'boolean' },
                        memberClassification: { type: 'string',
nullable: true },
                        cadPro: { type: 'string',
nullable: true },
                        familyIncome: { type: 'string',
nullable: true },
                        memberType: { type: 'string',
nullable: true },
                        boardPosition: { type: 'string',
nullable: true },
                        boardMember: { type: 'boolean' },
                        memberStatus: { type: 'string',
nullable: true },
                        memberSince: { type: 'string',
nullable: true },
                        memberNotes: { type: 'string',
nullable: true },
                        memberNotesNumber: { type: 'string',
nullable: true },
                        isPartner: { type: 'boolean',
description: 'Mark as public partner' },
                        partnerUrl: { type: 'string',
nullable: true,
description: 'Partner website URL' },
                        partnerOrder: { type: 'integer',
minimum: 0,
nullable: true,
description: 'Display order in partner list' },
                        bio: { type: 'string',
nullable: true,
description: 'Instructor bio (only saved if user is an instructor)' },
                        linkedin: { type: 'string',
nullable: true },
                        instagram: { type: 'string',
nullable: true },
                        facebook: { type: 'string',
nullable: true },
                    },
                },
                response: {
                    200: { type: 'object',
properties: { message: { type: 'string' } } },
                    400: { type: 'object',
properties: { error: { type: 'string' } } },
                    401: { type: 'object',
properties: { error: { type: 'string' } } },
                    403: { type: 'object',
properties: { error: { type: 'string' } } },
                    404: { type: 'object',
properties: { error: { type: 'string' } } },
                    409: { type: 'object',
properties: { error: { type: 'string' } } },
                },
            },
        },
        (req: FastifyRequest, res: FastifyReply) =>
            updateUserController.handle(
                req as Parameters<typeof updateUserController.handle>[0],
                res,
            ),
    );

    fastify.delete(
        '/users/:id',
        {
            schema: {
                tags: ['Users'],
                summary: 'Delete worker user',
                security: [{ bearerAuth: [] }],
                params: {
                    type: 'object',
                    properties: { id: { type: 'string' } },
                    required: ['id'],
                },
                response: {
                    204: { type: 'null' },
                    401: { type: 'object',
properties: { error: { type: 'string' } } },
                    403: { type: 'object',
properties: { error: { type: 'string' } } },
                    404: { type: 'object',
properties: { error: { type: 'string' } } },
                },
            },
        },
        (req: FastifyRequest, res: FastifyReply) =>
            deleteUserController.handle(
                req as Parameters<typeof deleteUserController.handle>[0],
                res,
            ),
    );

    fastify.get(
        '/partners',
        {
            schema: {
                tags: ['Parceiros'],
                summary: 'Listar parceiros públicos',
                description: 'Retorna UserData marcados como isPartner=true, ordenados por partnerOrder ASC (nulls last) depois name ASC. Sem autenticação.',
                response: {
                    200: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                id: { type: 'string' },
                                name: { type: 'string' },
                                avatarUrl: { type: 'string',
nullable: true },
                                partnerLogoUrl: { type: 'string',
nullable: true },
                                partnerUrl: { type: 'string',
nullable: true },
                                cnpj: { type: 'string',
nullable: true },
                            },
                        },
                    },
                },
            },
        },
        (req: FastifyRequest, res: FastifyReply) => listPartnersController.handle(req, res),
    );

    fastify.patch(
        '/admin/partners/reorder',
        {
            schema: {
                tags: ['Parceiros'],
                summary: 'Reordenar parceiros',
                security: [{ bearerAuth: [] }],
                body: {
                    type: 'object',
                    required: ['order'],
                    properties: {
                        order: { type: 'array',
items: { type: 'string' },
description: 'Array de UserData IDs na nova ordem' },
                    },
                },
                response: {
                    200: { type: 'object',
properties: { message: { type: 'string' } } },
                    400: { type: 'object',
properties: { error: { type: 'string' } } },
                    401: { type: 'object',
properties: { error: { type: 'string' } } },
                    403: { type: 'object',
properties: { error: { type: 'string' } } },
                },
            },
        },
        async (req: FastifyRequest, res: FastifyReply) => {
            const userId = await requirePermission(req, res, 'UPDATE_USER', getAdminPermissions);
            if (!userId) return;
            return reorderPartnersController.handle(req, res);
        },
    );

    fastify.post(
        '/admin/users/:id/partner-logo',
        {
            schema: {
                tags: ['Parceiros'],
                summary: 'Upload da logo do parceiro (300×150px)',
                description: 'Aceita multipart/form-data com campo "file". PNG/JPG/WebP, max 5MB. Redimensiona para 300×150px com fundo transparente.',
                security: [{ bearerAuth: [] }],
                consumes: ['multipart/form-data'],
                params: {
                    type: 'object',
                    required: ['id'],
                    properties: { id: { type: 'string' } },
                },
                response: {
                    200: { type: 'object',
properties: { partnerLogoUrl: { type: 'string' } } },
                    400: { type: 'object',
properties: { error: { type: 'string' } } },
                    401: { type: 'object',
properties: { error: { type: 'string' } } },
                    403: { type: 'object',
properties: { error: { type: 'string' } } },
                    404: { type: 'object',
properties: { error: { type: 'string' } } },
                },
            },
        },
        async (req: FastifyRequest, res: FastifyReply) => {
            const userId = await requirePermission(req, res, 'UPDATE_USER', getAdminPermissions);
            if (!userId) return;
            return uploadPartnerLogoController.handle(
                req as Parameters<typeof uploadPartnerLogoController.handle>[0],
                res,
            );
        },
    );

    fastify.post(
        '/admin/users/:id/avatar',
        {
            schema: {
                tags: ['Admin — Users'],
                summary: 'Upload avatar for a worker',
                description: `Uploads an image as the worker's avatar. Requires JWT token with \`UPDATE_USER\` permission.

**Business rules:**
- Send as \`multipart/form-data\` with the file in the \`file\` field
- The URL is saved to \`UserData.avatar\` and returned in \`avatarUrl\`
- Uploading a new avatar overwrites the previous URL (old file remains in storage)`,
                security: [{ bearerAuth: [] }],
                consumes: ['multipart/form-data'],
                params: {
                    type: 'object',
                    required: ['id'],
                    properties: { id: { type: 'string' } },
                },
                response: {
                    200: { type: 'object',
properties: { avatarUrl: { type: 'string' } } },
                    400: { type: 'object',
properties: { error: { type: 'string' } } },
                    401: { type: 'object',
properties: { error: { type: 'string' } } },
                    403: { type: 'object',
properties: { error: { type: 'string' } } },
                    404: { type: 'object',
properties: { error: { type: 'string' } } },
                },
            },
        },
        (req: FastifyRequest, res: FastifyReply) =>
            uploadAvatarController.handle(
                req as Parameters<typeof uploadAvatarController.handle>[0],
                res,
            ),
    );
}
