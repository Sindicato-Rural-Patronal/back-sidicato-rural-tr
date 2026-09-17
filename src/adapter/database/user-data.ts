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

// Todo INSERT/UPDATE de UserData passa por aqui: normaliza o CPF num lugar só
// (cadastro e edição no painel, inscrição pública em curso). Sem `cpf` no data, não mexe.
function withStoredCpf<T extends { cpf?: string | null }>(data: T): T {
    return data.cpf === undefined ? data : { ...data,
cpf: cpfForStorage(data.cpf) };
}

export class UserDataAdapter implements UserDataRepository {
    constructor(private prisma: PrismaClient) {}
    create(data: UserDataUncheckedCreateInput): Promise<UserDataModel | null> {
        return this.prisma.userData.create({
            data: withStoredCpf(data),
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

    async findByEmailOrCpf(email: string, cpf: string): Promise<UserDataModel | null> {
        const digits = cpf.replace(/\D/g, '');
        // O CPF é a identidade: se bate por CPF, é a pessoa (prioridade). Só casa
        // por e-mail quando o registro NÃO tem CPF ou tem o MESMO CPF — assim um
        // e-mail que pertence a outra pessoa (CPF diferente) não vincula errado
        // (o create seguinte colide no unique de e-mail e vira 409, não bind).
        const rows = await this.prisma.$queryRaw<UserDataModel[]>`
            SELECT * FROM "UserData"
            WHERE "isDeleted" = false
              AND (
                    (${digits} <> ''
                     AND regexp_replace(COALESCE("cpf", ''), '[^0-9]', '', 'g') = ${digits})
                    OR ("email" = ${email}
                        AND (COALESCE("cpf", '') = ''
                             OR regexp_replace(COALESCE("cpf", ''), '[^0-9]', '', 'g') = ${digits}))
                  )
            ORDER BY (
                CASE WHEN ${digits} <> ''
                          AND regexp_replace(COALESCE("cpf", ''), '[^0-9]', '', 'g') = ${digits}
                     THEN 0 ELSE 1 END
            )
            LIMIT 1`;
        return rows[0] ?? null;
    }

    update(id: string, data: UserDataUpdateInput): Promise<UserDataModel | null> {
        return this.prisma.userData.update({ where: { id },
data: withStoredCpf(data) });
    }

    async delete(id: string): Promise<void> {
        await this.prisma.userData.update({
            where: { id },
            data: { isDeleted: true,
deletedAt: new Date() },
        });
    }
}
