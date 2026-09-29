import type { PrismaClient } from '@prisma/client/extension';
import { buildUserListWhere } from './list-filters.js';
import type { UserDataUncheckedCreateInput, UserDataModel } from '../../generated/prisma/models';
import type {
    UserDataRepository,
    UserDataUpdateInput,
    UserDataWithRelations,
    UserListFilters,
} from '../../ports/external/user-data-repository.js';

export function createUserDataAdapter(prisma: PrismaClient): UserDataRepository {
    return new UserDataAdapter(prisma);
}

/** CPF é gravado só com dígitos (o painel mandava com e sem máscara); vazio vira null. */
export function cpfForStorage(cpf: string | null): string | null {
    return cpf?.replace(/\D/g, '') || null;
}

/** E-mail é opcional: sem espaços nas pontas; vazio vira null. */
export function emailForStorage(email: string | null): string | null {
    return email?.trim() || null;
}

// Todo INSERT/UPDATE de UserData passa por aqui: normaliza CPF e e-mail num lugar só
// (cadastro e edição no painel, inscrição pública em curso). Campo ausente no data não é mexido.
interface StoredDocs {
    cpf?: string | null;
    email?: string | null;
}
function withStoredDocs<T extends StoredDocs>(data: T): T {
    const out = { ...data };
    if (data.cpf !== undefined) out.cpf = cpfForStorage(data.cpf);
    if (data.email !== undefined) out.email = emailForStorage(data.email);
    return out;
}

export class UserDataAdapter implements UserDataRepository {
    constructor(private prisma: PrismaClient) {}
    create(data: UserDataUncheckedCreateInput): Promise<UserDataModel | null> {
        return this.prisma.userData.create({
            data: withStoredDocs(data),
        });
    }
    findById(id: string): Promise<UserDataModel | null> {
        return this.prisma.userData.findFirst({ where: { id,
isDeleted: false } });
    }

    findByIdWithRelations(id: string): Promise<UserDataWithRelations | null> {
        return this.prisma.userData.findFirst({
            where: { id,
isDeleted: false },
            include: {
                relations: {
                    where: { isDeleted: false,
target: { isDeleted: false } },
                    include: {
                        target: {
                            select: { id: true,
name: true,
cpf: true },
                        },
                    },
                },
                properties: {
                    where: { isDeleted: false },
                    include: {
                        address: true,
                    },
                },
                userInstructor: true,
                companyMemberships: {
                    where: { company: { isDeleted: false } },
                    select: {
                        id: true,
                        title: true,
                        company: { select: { id: true,
name: true,
tradeName: true,
cnpj: true,
type: true,
isPartner: true } },
                    },
                    orderBy: { company: { name: 'asc' } },
                },
            },
        }) as Promise<UserDataWithRelations | null>;
    }

    findAll(filters?: UserListFilters, skip?: number, take?: number): Promise<UserDataModel[]> {
        return this.prisma.userData.findMany({
            where: this.buildWhere(filters),
            orderBy: { name: 'asc' },
            skip,
            take,
        });
    }

    count(filters?: UserListFilters): Promise<number> {
        return this.prisma.userData.count({ where: this.buildWhere(filters) });
    }

    private buildWhere(filters?: UserListFilters) {
        return buildUserListWhere(filters);
    }

    // Compara por CPF ignorando formatação: os CPFs foram gravados em formatos
    // inconsistentes (com pontos, traços, só dígitos), então normalizamos os
    // dois lados removendo tudo que não é dígito.
    async findByCpf(cpf: string): Promise<UserDataModel | null> {
        const digits = cpf.replace(/\D/g, '');
        if (!digits) return null;
        const rows = await this.prisma.$queryRaw<UserDataModel[]>`
            SELECT * FROM "UserData"
            WHERE "isDeleted" = false
              AND regexp_replace(COALESCE("cpf", ''), '[^0-9]', '', 'g') = ${digits}
            LIMIT 1`;
        return rows[0] ?? null;
    }

    findByRg(rg: string): Promise<UserDataModel | null> {
        return this.prisma.userData.findFirst({ where: { isDeleted: false,
rg } });
    }

    update(id: string, data: UserDataUpdateInput): Promise<UserDataModel | null> {
        return this.prisma.userData.update({ where: { id },
data: withStoredDocs(data) });
    }

    // Excluir a pessoa leva junto tudo que só existe por causa dela. Antes, só
    // a ficha era marcada: o acesso ao painel continuava valendo, a inscrição
    // continuava ocupando vaga no curso e o vínculo com a empresa continuava
    // aparecendo — tudo apontando para um cadastro que não existe mais.
    //
    // Nada disso é apagado de verdade: o histórico (auditoria, lista de
    // presença de curso já realizado) continua no banco, só sai das telas.
    async delete(id: string): Promise<void> {
        const deletedAt = new Date();
        const marcar = { isDeleted: true,
deletedAt } as const;

        await this.prisma.$transaction(async (tx: unknown) => {
            const t = tx as PrismaClient;

            await t.userData.update({ where: { id },
data: marcar });

            // Acesso ao painel: sem isso a pessoa excluída continuava entrando.
            await t.userAdmin.updateMany({ where: { userDataId: id,
isDeleted: false },
data: marcar });
            await t.adminInvite.deleteMany({ where: { userDataId: id,
usedAt: null } });

            // Inscrições ativas: liberam a vaga e somem da lista do curso.
            await t.courseUserRegistration.updateMany({
                where: { userDataId: id,
isDeleted: false },
                data: marcar,
            });

            // Instrutor: tira dos cursos em que estava escalado.
            const instrutor = await t.userInstructor.findFirst({
                where: { userDataId: id },
                select: { id: true },
            });
            if (instrutor) {
                await t.courseInstructor.updateMany({
                    where: { instructorId: instrutor.id,
isDeleted: false },
                    data: marcar,
                });
            }

            await t.unimedBeneficiario.updateMany({ where: { userDataId: id,
isDeleted: false },
data: marcar });
            await t.property.updateMany({ where: { userDataId: id,
isDeleted: false },
data: marcar });
            await t.userRelation.updateMany({
                where: { OR: [{ sourceId: id }, { targetId: id }],
isDeleted: false },
                data: marcar,
            });

            // Estas duas não têm exclusão lógica: a linha some mesmo.
            await t.publicContact.deleteMany({ where: { userDataId: id } });
            await t.companyMember.deleteMany({ where: { userDataId: id } });
        });
    }
}
