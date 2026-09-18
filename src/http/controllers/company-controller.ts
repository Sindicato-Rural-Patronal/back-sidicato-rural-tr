import type { FastifyRequest, FastifyReply } from 'fastify';
import type {
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
import type { UpdatePropertyUseCase } from '../../usecase/update-property.js';
import type { UploadCompanyPartnerLogoUseCase } from '../../usecase/upload-company-partner-logo.js';
import type { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import { requirePermission, errorToStatus } from '../lib/require-permission.js';

type IdParams = { id: string };
type MemberParams = {
 id: string;
memberId: string 
};
type PropertyParams = {
 id: string;
propertyId: string 
};

export type CompanyUseCases = {
    list: ListCompaniesUseCase;
    get: GetCompanyUseCase;
    create: CreateCompanyUseCase;
    update: UpdateCompanyUseCase;
    remove: DeleteCompanyUseCase;
    addMember: AddCompanyMemberUseCase;
    updateMember: UpdateCompanyMemberUseCase;
    removeMember: RemoveCompanyMemberUseCase;
    titles: ListMemberTitlesUseCase;
    addProperty: AddCompanyPropertyUseCase;
    updateProperty: UpdatePropertyUseCase;
    removeProperty: RemoveCompanyPropertyUseCase;
    uploadPartnerLogo: UploadCompanyPartnerLogoUseCase;
    listPartners: ListPartnersUseCase;
    reorderPartners: ReorderPartnersUseCase;
};

// Empresas fazem parte dos cadastros: usam as mesmas permissões de usuários.
export class CompanyController {
    constructor(
        private readonly uc: CompanyUseCases,
        private readonly getAdminPermissions: GetAdminPermissionsUseCase,
    ) {}

    private can(req: FastifyRequest, reply: FastifyReply, perm: string) {
        return requirePermission(req, reply, perm, this.getAdminPermissions);
    }

    private fail(reply: FastifyReply, error: Error) {
        return reply.status(errorToStatus(error)).send({ error: error.message });
    }

    async list(req: FastifyRequest, reply: FastifyReply) {
        if ((await this.can(req, reply, 'READ_USER')) === null) return;
        const r = await this.uc.list.execute(req.query);
        if (r.error) return this.fail(reply, r.error);
        return reply.send(r.result);
    }

    async get(req: FastifyRequest<{ Params: IdParams }>, reply: FastifyReply) {
        if ((await this.can(req, reply, 'READ_USER')) === null) return;
        const r = await this.uc.get.execute(req.params.id);
        if (r.error) return this.fail(reply, r.error);
        return reply.send(r.company);
    }

    async create(req: FastifyRequest, reply: FastifyReply) {
        const adminId = await this.can(req, reply, 'CREATE_USER');
        if (adminId === null) return;
        const r = await this.uc.create.execute(req.body, adminId);
        if (r.error) return this.fail(reply, r.error);
        return reply.status(201).send(r.company);
    }

    async update(req: FastifyRequest<{ Params: IdParams }>, reply: FastifyReply) {
        if ((await this.can(req, reply, 'UPDATE_USER')) === null) return;
        const r = await this.uc.update.execute(req.params.id, req.body);
        if (r.error) return this.fail(reply, r.error);
        return reply.send(r.company);
    }

    async remove(req: FastifyRequest<{ Params: IdParams }>, reply: FastifyReply) {
        if ((await this.can(req, reply, 'DELETE_USER')) === null) return;
        const r = await this.uc.remove.execute(req.params.id);
        if (r.error) return this.fail(reply, r.error);
        return reply.status(204).send();
    }

    async titles(req: FastifyRequest, reply: FastifyReply) {
        if ((await this.can(req, reply, 'READ_USER')) === null) return;
        return reply.send(await this.uc.titles.execute());
    }

    async addMember(req: FastifyRequest<{ Params: IdParams }>, reply: FastifyReply) {
        if ((await this.can(req, reply, 'UPDATE_USER')) === null) return;
        const r = await this.uc.addMember.execute(req.params.id, req.body);
        if (r.error) return this.fail(reply, r.error);
        return reply.status(201).send(r.member);
    }

    async updateMember(req: FastifyRequest<{ Params: MemberParams }>, reply: FastifyReply) {
        if ((await this.can(req, reply, 'UPDATE_USER')) === null) return;
        const r = await this.uc.updateMember.execute(req.params.id, req.params.memberId, req.body);
        if (r.error) return this.fail(reply, r.error);
        return reply.send(r.member);
    }

    async removeMember(req: FastifyRequest<{ Params: MemberParams }>, reply: FastifyReply) {
        if ((await this.can(req, reply, 'UPDATE_USER')) === null) return;
        const r = await this.uc.removeMember.execute(req.params.id, req.params.memberId);
        if (r.error) return this.fail(reply, r.error);
        return reply.status(204).send();
    }

    async addProperty(req: FastifyRequest<{ Params: IdParams }>, reply: FastifyReply) {
        if ((await this.can(req, reply, 'UPDATE_USER')) === null) return;
        const r = await this.uc.addProperty.execute(req.params.id, req.body);
        if (r.error) return this.fail(reply, r.error);
        return reply.status(201).send({ id: r.property!.id });
    }

    async updateProperty(req: FastifyRequest<{ Params: PropertyParams }>, reply: FastifyReply) {
        if ((await this.can(req, reply, 'UPDATE_USER')) === null) return;
        const r = await this.uc.updateProperty.execute(
            req.params.propertyId,
            { companyId: req.params.id },
            req.body,
        );
        if (r.error) return this.fail(reply, r.error);
        return reply.send(r.property);
    }

    async removeProperty(req: FastifyRequest<{ Params: PropertyParams }>, reply: FastifyReply) {
        if ((await this.can(req, reply, 'UPDATE_USER')) === null) return;
        const r = await this.uc.removeProperty.execute(req.params.id, req.params.propertyId);
        if (r.error) return this.fail(reply, r.error);
        return reply.status(204).send();
    }

    async uploadPartnerLogo(req: FastifyRequest<{ Params: IdParams }>, reply: FastifyReply) {
        if ((await this.can(req, reply, 'UPDATE_USER')) === null) return;
        const data = await req.file();
        if (!data) return reply.status(400).send({ error: 'Nenhum arquivo enviado.' });
        const chunks: Buffer[] = [];
        for await (const chunk of data.file) chunks.push(chunk);
        if (data.file.truncated) return reply.status(400).send({ error: 'Arquivo excede o limite permitido.' });
        const r = await this.uc.uploadPartnerLogo.execute(req.params.id, Buffer.concat(chunks), data.mimetype);
        if (r.error) return this.fail(reply, r.error);
        return reply.send({ partnerLogoUrl: r.partnerLogoUrl });
    }

    async listPartners(_req: FastifyRequest, reply: FastifyReply) {
        const r = await this.uc.listPartners.execute();
        return reply.send(r.partners);
    }

    async reorderPartners(req: FastifyRequest, reply: FastifyReply) {
        if ((await this.can(req, reply, 'UPDATE_USER')) === null) return;
        const r = await this.uc.reorderPartners.execute(req.body);
        if (r.error) return this.fail(reply, r.error);
        return reply.send({ message: 'ok' });
    }
}
