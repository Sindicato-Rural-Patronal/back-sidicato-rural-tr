import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client/extension';
import { createCompanyAdapter } from '../../adapter/database/company-adapter.js';
import { createUserDataAdapter } from '../../adapter/database/user-data.js';
import { createPropertyAdapter } from '../../adapter/database/property-adapter.js';
import { createAddressAdapter } from '../../adapter/database/address-adapter.js';
import { createUserAdminAdapter } from '../../adapter/database/user-admin-adapter.js';
import { createRuleAdapter } from '../../adapter/database/rule-adapter.js';
import { createStorageAdapter } from '../../adapter/storage/factory.js';
import { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import {
    ListCompaniesUseCase,
    GetCompanyUseCase,
    CreateCompanyUseCase,
    UpdateCompanyUseCase,
    DeleteCompanyUseCase,
    AddCompanyMemberUseCase,
    UpdateCompanyMemberUseCase,
    RemoveCompanyMemberUseCase,
    ListMemberTitlesUseCase,
    AddCompanyPropertyUseCase,
    RemoveCompanyPropertyUseCase,
    ListPartnersUseCase,
    ReorderPartnersUseCase,
} from '../../usecase/company-usecases.js';
import { UploadCompanyPartnerLogoUseCase } from '../../usecase/upload-company-partner-logo.js';
import { CompanyController } from '../controllers/company-controller.js';
import { errorResponse, pagedResponse } from '../lib/swagger-schemas.js';

// ── Schemas (Swagger + serialização) ─────────────────────────────────────────
// fast-json-stringify descarta campos não declarados: tudo que sai está listado.

const str = { type: 'string' };
const nstr = { type: 'string',
nullable: true };

const addressSchema = {
    type: 'object',
    nullable: true,
    properties: {
        id: str,
type: str,
city: nstr,
state: nstr,
zipCode: nstr,
complement: nstr,
notes: nstr,
        street: nstr,
number: nstr,
neighborhood: nstr,
localityName: nstr,
road: nstr,
km: nstr,
lot: nstr,
section: nstr,
    },
};

const propertySchema = {
    type: 'object',
    properties: { id: str,
name: str,
registration: nstr,
address: addressSchema },
};

const companyProperties = {
    id: str,
    name: str,
    tradeName: nstr,
    addressId: nstr,
    address: addressSchema,
    cnpj: nstr,
    stateRegistration: nstr,
    type: { type: 'string',
enum: ['PRIVATE', 'PUBLIC'] },
    phone: nstr,
    phone2: nstr,
    phone3: nstr,
    email: nstr,
    website: nstr,
    notes: nstr,
    isPartner: { type: 'boolean' },
    partnerUrl: nstr,
    partnerLogo: nstr,
    partnerOrder: { type: 'integer',
nullable: true },
    primaryPropertyId: nstr,
    createdAt: str,
    updatedAt: str,
};

const companyObject = { type: 'object',
properties: companyProperties };

const memberObject = {
    type: 'object',
    properties: {
        id: str,
        companyId: str,
        userDataId: str,
        title: str,
        createdAt: str,
        updatedAt: str,
        userData: { type: 'object',
properties: { id: str,
name: str,
cpf: nstr,
phone: str,
email: nstr } },
    },
};

const companyDetail = {
    type: 'object',
    properties: {
        ...companyProperties,
        members: { type: 'array',
items: memberObject },
        properties: { type: 'array',
items: propertySchema },
    },
};

const companyBody = {
    type: 'object',
    properties: {
        name: { type: 'string',
description: 'Razão social',
example: 'COOPERATIVA AGROINDUSTRIAL LTDA' },
        tradeName: { type: 'string',
nullable: true,
description: 'Nome fantasia',
example: 'COOPERATIVA AGRO' },
        address: {
            type: 'object',
            nullable: true,
            description: 'Endereço da sede; null ou tudo vazio remove',
            properties: { zipCode: nstr,
street: nstr,
number: nstr,
complement: nstr,
neighborhood: nstr,
city: nstr,
state: nstr },
        },
        cnpj: { type: 'string',
nullable: true,
example: '11.222.333/0001-81' },
        stateRegistration: { type: 'string',
nullable: true,
example: '9012345678' },
        type: { type: 'string',
enum: ['PRIVATE', 'PUBLIC'] },
        phone: nstr,
phone2: nstr,
phone3: nstr,
        email: nstr,
website: nstr,
notes: nstr,
        isPartner: { type: 'boolean' },
        partnerUrl: nstr,
        partnerOrder: { type: 'integer',
nullable: true },
        primaryPropertyId: nstr,
        partnerLogo: { type: 'null',
description: 'Só `null`, para remover o logo' },
    },
};

const idParams = { type: 'object',
required: ['id'],
properties: { id: str } };
const sec = [{ bearerAuth: [] }];
const errs = { 400: errorResponse,
401: errorResponse,
403: errorResponse,
404: errorResponse };
const tags = ['Empresas'];

export async function companyRouter(fastify: FastifyInstance, prisma: PrismaClient) {
    const repo = createCompanyAdapter(prisma);
    const propertyRepo = createPropertyAdapter(prisma);
    const addressRepo = createAddressAdapter(prisma);
    const controller = new CompanyController(
        {
            list: new ListCompaniesUseCase(repo),
            get: new GetCompanyUseCase(repo),
            create: new CreateCompanyUseCase(repo, addressRepo),
            update: new UpdateCompanyUseCase(repo, addressRepo),
            remove: new DeleteCompanyUseCase(repo),
            addMember: new AddCompanyMemberUseCase(repo, createUserDataAdapter(prisma)),
            updateMember: new UpdateCompanyMemberUseCase(repo),
            removeMember: new RemoveCompanyMemberUseCase(repo),
            titles: new ListMemberTitlesUseCase(repo),
            addProperty: new AddCompanyPropertyUseCase(repo, propertyRepo, addressRepo),
            removeProperty: new RemoveCompanyPropertyUseCase(repo, propertyRepo),
            uploadPartnerLogo: new UploadCompanyPartnerLogoUseCase(createStorageAdapter(), repo),
            listPartners: new ListPartnersUseCase(repo),
            reorderPartners: new ReorderPartnersUseCase(repo),
        },
        new GetAdminPermissionsUseCase(createUserAdminAdapter(prisma), createRuleAdapter(prisma)),
    );

    type Id = FastifyRequest<{ Params: { id: string } }>;
    type Member = FastifyRequest<{
 Params: {
 id: string;
memberId: string 
} 
}>;
    type Prop = FastifyRequest<{
 Params: {
 id: string;
propertyId: string 
} 
}>;

    fastify.get('/admin/companies', {
        schema: {
            tags,
summary: 'Listar empresas',
security: sec,
            querystring: {
                type: 'object',
                properties: {
                    page: { type: 'integer',
minimum: 1 },
                    limit: { type: 'integer',
minimum: 1,
maximum: 100 },
                    search: { type: 'string',
description: 'Nome, e-mail ou CNPJ' },
                    type: { type: 'string',
enum: ['PRIVATE', 'PUBLIC'] },
                    isPartner: { type: 'string',
enum: ['true', 'false'] },
                },
            },
            response: {
                200: pagedResponse({ type: 'object',
properties: { ...companyProperties,
membersCount: { type: 'integer' } } }),
                ...errs,
            },
        },
    }, (req: FastifyRequest, res: FastifyReply) => controller.list(req, res));

    // Antes de /:id para não ser capturada como id.
    fastify.get('/admin/companies/titles', {
        schema: {
            tags,
summary: 'Títulos já usados nos vínculos (sugestões)',
security: sec,
            response: { 200: { type: 'array',
items: str },
401: errorResponse,
403: errorResponse },
        },
    }, (req: FastifyRequest, res: FastifyReply) => controller.titles(req, res));

    fastify.get('/admin/companies/:id', {
        schema: { tags,
summary: 'Detalhe da empresa (pessoas e propriedades)',
security: sec,
params: idParams,
response: { 200: companyDetail,
...errs } },
    }, (req: Id, res: FastifyReply) => controller.get(req, res));

    fastify.post('/admin/companies', {
        schema: {
            tags,
summary: 'Criar empresa',
security: sec,
            body: { ...companyBody,
required: ['name'] },
            response: { 201: companyObject,
...errs,
409: errorResponse },
        },
    }, (req: FastifyRequest, res: FastifyReply) => controller.create(req, res));

    fastify.patch('/admin/companies/:id', {
        schema: {
            tags,
summary: 'Atualizar empresa',
security: sec,
params: idParams,
body: companyBody,
            response: { 200: companyObject,
...errs,
409: errorResponse },
        },
    }, (req: Id, res: FastifyReply) => controller.update(req, res));

    fastify.delete('/admin/companies/:id', {
        schema: { tags,
summary: 'Excluir empresa (lógica)',
security: sec,
params: idParams,
response: { 204: { type: 'null' },
...errs } },
    }, (req: Id, res: FastifyReply) => controller.remove(req, res));

    fastify.post('/admin/companies/:id/members', {
        schema: {
            tags,
summary: 'Vincular pessoa à empresa com um título',
security: sec,
params: idParams,
            body: {
                type: 'object',
                required: ['userDataId', 'title'],
                properties: { userDataId: str,
title: { type: 'string',
example: 'SÓCIO' } },
            },
            response: { 201: memberObject,
...errs,
409: errorResponse },
        },
    }, (req: Id, res: FastifyReply) => controller.addMember(req, res));

    fastify.patch('/admin/companies/:id/members/:memberId', {
        schema: {
            tags,
summary: 'Alterar o título do vínculo',
security: sec,
            params: { type: 'object',
required: ['id', 'memberId'],
properties: { id: str,
memberId: str } },
            body: { type: 'object',
required: ['title'],
properties: { title: str } },
            response: { 200: memberObject,
...errs },
        },
    }, (req: Member, res: FastifyReply) => controller.updateMember(req, res));

    fastify.delete('/admin/companies/:id/members/:memberId', {
        schema: {
            tags,
summary: 'Desvincular pessoa',
security: sec,
            params: { type: 'object',
required: ['id', 'memberId'],
properties: { id: str,
memberId: str } },
            response: { 204: { type: 'null' },
...errs },
        },
    }, (req: Member, res: FastifyReply) => controller.removeMember(req, res));

    fastify.post('/admin/companies/:id/properties', {
        schema: {
            tags,
summary: 'Adicionar propriedade/endereço à empresa',
security: sec,
params: idParams,
            body: {
                type: 'object',
                required: ['name', 'address'],
                properties: { name: str,
registration: nstr,
address: { type: 'object',
additionalProperties: true } },
            },
            response: { 201: { type: 'object',
properties: { id: str } },
...errs },
        },
    }, (req: Id, res: FastifyReply) => controller.addProperty(req, res));

    fastify.delete('/admin/companies/:id/properties/:propertyId', {
        schema: {
            tags,
summary: 'Remover propriedade/endereço da empresa',
security: sec,
            params: { type: 'object',
required: ['id', 'propertyId'],
properties: { id: str,
propertyId: str } },
            response: { 204: { type: 'null' },
...errs },
        },
    }, (req: Prop, res: FastifyReply) => controller.removeProperty(req, res));

    fastify.post('/admin/companies/:id/partner-logo', {
        schema: {
            tags,
summary: 'Upload do logo de parceiro (300×150, PNG)',
security: sec,
params: idParams,
            consumes: ['multipart/form-data'],
            response: { 200: { type: 'object',
properties: { partnerLogoUrl: str } },
...errs },
        },
    }, (req: Id, res: FastifyReply) => controller.uploadPartnerLogo(req, res));

    // ── Parceiros ───────────────────────────────────────────────────────────
    fastify.get('/partners', {
        schema: {
            tags: ['Parceiros'],
            summary: 'Listar parceiros públicos',
            description: 'Empresas ativas marcadas como parceiras, por partnerOrder (nulos por último) e nome. Sem autenticação.',
            response: {
                200: {
                    type: 'array',
                    items: { type: 'object',
properties: { id: str,
name: str,
partnerLogoUrl: nstr,
partnerUrl: nstr } },
                },
            },
        },
    }, (req: FastifyRequest, res: FastifyReply) => controller.listPartners(req, res));

    fastify.patch('/admin/partners/reorder', {
        schema: {
            tags: ['Parceiros'],
summary: 'Reordenar empresas parceiras',
security: sec,
            body: { type: 'object',
required: ['order'],
properties: { order: { type: 'array',
items: str,
description: 'Ids de empresas na nova ordem' } } },
            response: { 200: { type: 'object',
properties: { message: str } },
400: errorResponse,
401: errorResponse,
403: errorResponse },
        },
    }, (req: FastifyRequest, res: FastifyReply) => controller.reorderPartners(req, res));
}
