import type { PrismaClient } from '@prisma/client/extension';
import type { UserDataUpdateInput } from '../../ports/external/user-data-repository.js';
import type {
    DuplicateGroup,
    DuplicatePerson,
    DuplicateReason,
    MergeCounts,
    MergeSide,
    UserMergeRepository,
} from '../../ports/external/user-merge-repository.js';

export function createUserMergeAdapter(prisma: PrismaClient): UserMergeRepository {
    return new UserMergeAdapter(prisma);
}

/** Linha crua da consulta de duplicados (COUNT do Postgres volta como bigint). */
type DuplicateRow = {
    reason: DuplicateReason;
    key: string;
    id: string;
    name: string;
    cpf: string | null;
    email: string | null;
    phone: string;
    createdAt: Date;
    has_login: boolean;
    registrations: bigint;
    companies: bigint;
    properties: bigint;
    relations: bigint;
};

export class UserMergeAdapter implements UserMergeRepository {
    constructor(private prisma: PrismaClient) {}

    // Possíveis duplicados: pessoas ativas que compartilham o nome normalizado
    // (`nameSearch`, preenchida por trigger), o telefone só com dígitos ou o
    // e-mail minúsculo — e em que pelo menos uma está sem CPF (o cadastro antigo
    // que a inscrição pública, que só reconhece por CPF, não achou).
    async findDuplicateGroups(limit: number): Promise<DuplicateGroup[]> {
        const rows = await this.prisma.$queryRaw<DuplicateRow[]>`
            WITH base AS (
                SELECT id, name, cpf, email, phone, "createdAt",
                       NULLIF(COALESCE(NULLIF("nameSearch", ''), lower(name)), '') AS name_key,
                       NULLIF(regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g'), '') AS phone_key,
                       NULLIF(lower(btrim(COALESCE(email, ''))), '') AS email_key,
                       NULLIF(regexp_replace(COALESCE(cpf, ''), '[^0-9]', '', 'g'), '') AS cpf_digits
                FROM "UserData"
                WHERE "isDeleted" = false
            ),
            keyed AS (
                SELECT 'NOME' AS reason, name_key AS key, id, cpf_digits FROM base WHERE name_key IS NOT NULL
                UNION ALL
                SELECT 'TELEFONE', phone_key, id, cpf_digits FROM base WHERE phone_key IS NOT NULL
                UNION ALL
                SELECT 'EMAIL', email_key, id, cpf_digits FROM base WHERE email_key IS NOT NULL
            ),
            groups AS (
                SELECT reason, key
                FROM keyed
                GROUP BY reason, key
                HAVING COUNT(*) > 1 AND COUNT(*) FILTER (WHERE cpf_digits IS NULL) > 0
                ORDER BY CASE reason WHEN 'NOME' THEN 0 WHEN 'TELEFONE' THEN 1 ELSE 2 END, key
                LIMIT ${limit}
            )
            SELECT g.reason::text AS reason, g.key AS key,
                   b.id, b.name, b.cpf, b.email, b.phone, b."createdAt",
                   EXISTS (SELECT 1 FROM "UserAdmin" a WHERE a."userDataId" = b.id) AS has_login,
                   (SELECT COUNT(*) FROM "courseUserRegistration" r
                     WHERE r."userDataId" = b.id AND r."isDeleted" = false) AS registrations,
                   (SELECT COUNT(*) FROM "CompanyMember" m WHERE m."userDataId" = b.id) AS companies,
                   (SELECT COUNT(*) FROM "Property" p
                     WHERE p."userDataId" = b.id AND p."isDeleted" = false) AS properties,
                   (SELECT COUNT(*) FROM "UserRelation" ur
                     WHERE (ur."sourceId" = b.id OR ur."targetId" = b.id) AND ur."isDeleted" = false) AS relations
            FROM groups g
            JOIN keyed k ON k.reason = g.reason AND k.key = g.key
            JOIN "UserData" b ON b.id = k.id
            ORDER BY CASE g.reason WHEN 'NOME' THEN 0 WHEN 'TELEFONE' THEN 1 ELSE 2 END,
                     g.key, b."createdAt"`;

        const byGroup = new Map<string, DuplicateGroup>();
        for (const row of rows) {
            const groupKey = `${row.reason}:${row.key}`;
            let group = byGroup.get(groupKey);
            if (!group) {
                group = { key: row.key,
reason: row.reason,
people: [] };
                byGroup.set(groupKey, group);
            }
            group.people.push({
                id: row.id,
                name: row.name,
                cpf: row.cpf,
                email: row.email,
                phone: row.phone,
                createdAt: row.createdAt,
                hasLogin: row.has_login,
                counts: {
                    registrations: Number(row.registrations),
                    companies: Number(row.companies),
                    properties: Number(row.properties),
                    relations: Number(row.relations),
                },
            });
        }
        return [...byGroup.values()];
    }

    // Os mesmos números da lista de duplicados, para a comparação lado a lado do
    // diálogo "Juntar cadastros" (a pessoa escolhida ali pode não estar na lista).
    async findPeopleForCompare(ids: string[]): Promise<DuplicatePerson[]> {
        if (ids.length === 0) return [];
        const rows: Omit<DuplicateRow, 'reason' | 'key'>[] = await this.prisma.$queryRaw`
            SELECT b.id, b.name, b.cpf, b.email, b.phone, b."createdAt",
                   EXISTS (SELECT 1 FROM "UserAdmin" a WHERE a."userDataId" = b.id) AS has_login,
                   (SELECT COUNT(*) FROM "courseUserRegistration" r
                     WHERE r."userDataId" = b.id AND r."isDeleted" = false) AS registrations,
                   (SELECT COUNT(*) FROM "CompanyMember" m WHERE m."userDataId" = b.id) AS companies,
                   (SELECT COUNT(*) FROM "Property" p
                     WHERE p."userDataId" = b.id AND p."isDeleted" = false) AS properties,
                   (SELECT COUNT(*) FROM "UserRelation" ur
                     WHERE (ur."sourceId" = b.id OR ur."targetId" = b.id) AND ur."isDeleted" = false) AS relations
            FROM "UserData" b
            WHERE b."isDeleted" = false AND b.id = ANY(${ids}::text[])`;
        return rows.map(row => ({
            id: row.id,
            name: row.name,
            cpf: row.cpf,
            email: row.email,
            phone: row.phone,
            createdAt: row.createdAt,
            hasLogin: row.has_login,
            counts: {
                registrations: Number(row.registrations),
                companies: Number(row.companies),
                properties: Number(row.properties),
                relations: Number(row.relations),
            },
        }));
    }

    async findForMerge(id: string): Promise<MergeSide | null> {
        const person = await this.prisma.userData.findUnique({ where: { id } });
        if (!person) return null;
        // Conta excluída também bloqueia: UserAdmin."userDataId" é único no banco.
        const admin: { id: string } | null = await this.prisma.userAdmin.findFirst({
            where: { userDataId: id },
            select: { id: true },
        });
        return { ...(person as MergeSide),
hasLogin: !!admin };
    }

    // Tudo numa transação: se qualquer passo falhar, nada muda. A ordem importa —
    // o cadastro removido é marcado como excluído ANTES de o CPF dele ir para o
    // que fica (o índice único de CPF só vale entre cadastros ativos).
    async merge(input: {
        keepId: string;
        removeId: string;
        fill: UserDataUpdateInput;
    }): Promise<MergeCounts> {
        const { keepId, removeId, fill } = input;
        const now = new Date();
        return this.prisma.$transaction(async (tx: unknown) => {
            const t = tx as PrismaClient;

            // Inscrições em curso: inscrita nos dois cadastros no mesmo curso,
            // fica a do cadastro que permanece e a outra é cancelada (o índice
            // único (curso, pessoa) só permite uma inscrição ativa).
            const keepRegs: { courseId: string }[] = await t.courseUserRegistration.findMany({
                where: { userDataId: keepId,
isDeleted: false },
                select: { courseId: true },
            });
            const keepCourses = new Set(keepRegs.map(r => r.courseId));
            const removeRegs: {
 id: string;
courseId: string 
}[] =
                await t.courseUserRegistration.findMany({
                    where: { userDataId: removeId,
isDeleted: false },
                    select: { id: true,
courseId: true },
                });
            const dupRegIds = removeRegs.filter(r => keepCourses.has(r.courseId)).map(r => r.id);
            const moveRegIds = removeRegs.filter(r => !keepCourses.has(r.courseId)).map(r => r.id);
            if (dupRegIds.length > 0) {
                await t.courseUserRegistration.updateMany({
                    where: { id: { in: dupRegIds } },
                    data: { isDeleted: true,
deletedAt: now },
                });
            }
            if (moveRegIds.length > 0) {
                await t.courseUserRegistration.updateMany({
                    where: { id: { in: moveRegIds } },
                    data: { userDataId: keepId },
                });
            }

            // Vínculos com empresas: vinculada às duas na mesma empresa, fica o
            // título do cadastro que permanece (uma pessoa por empresa).
            const keepMembers: { companyId: string }[] = await t.companyMember.findMany({
                where: { userDataId: keepId },
                select: { companyId: true },
            });
            const keepCompanies = new Set(keepMembers.map(m => m.companyId));
            const removeMembers: {
 id: string;
companyId: string 
}[] =
                await t.companyMember.findMany({
                    where: { userDataId: removeId },
                    select: { id: true,
companyId: true },
                });
            const dupMemberIds = removeMembers
                .filter(m => keepCompanies.has(m.companyId))
                .map(m => m.id);
            const moveMemberIds = removeMembers
                .filter(m => !keepCompanies.has(m.companyId))
                .map(m => m.id);
            if (dupMemberIds.length > 0) {
                await t.companyMember.deleteMany({ where: { id: { in: dupMemberIds } } });
            }
            if (moveMemberIds.length > 0) {
                await t.companyMember.updateMany({
                    where: { id: { in: moveMemberIds } },
                    data: { userDataId: keepId },
                });
            }

            // Propriedades (o endereço da pessoa vive aqui).
            const movedProps: { count: number } = await t.property.updateMany({
                where: { userDataId: removeId,
isDeleted: false },
                data: { userDataId: keepId },
            });

            // Relações: primeiro some a relação entre os dois cadastros (viraria
            // uma relação da pessoa com ela mesma).
            await t.userRelation.updateMany({
                where: {
                    isDeleted: false,
                    OR: [
                        { sourceId: keepId,
targetId: removeId },
                        { sourceId: removeId,
targetId: keepId },
                    ],
                },
                data: { isDeleted: true,
deletedAt: now },
            });
            const movedRelations = await moveRelations(t, keepId, removeId, now);

            // Unimed, contato público e instrutor são 1:1 com a pessoa: só vão
            // para o cadastro que fica quando ele ainda não tem o seu.
            const keepUnimed: { id: string } | null = await t.unimedBeneficiario.findFirst({
                where: { userDataId: keepId },
                select: { id: true },
            });
            if (!keepUnimed) {
                await t.unimedBeneficiario.updateMany({
                    where: { userDataId: removeId },
                    data: { userDataId: keepId },
                });
            }
            // Dependentes que apontavam para o cadastro removido como titular.
            await t.unimedBeneficiario.updateMany({
                where: { titularId: removeId },
                data: { titularId: keepId },
            });

            const keepContact: { id: string } | null = await t.publicContact.findFirst({
                where: { userDataId: keepId },
                select: { id: true },
            });
            if (keepContact) {
                // Deixar o do removido mostraria uma pessoa excluída em "Nossa Equipe".
                await t.publicContact.deleteMany({ where: { userDataId: removeId } });
            } else {
                await t.publicContact.updateMany({
                    where: { userDataId: removeId },
                    data: { userDataId: keepId },
                });
            }

            const keepInstructor: { id: string } | null = await t.userInstructor.findFirst({
                where: { userDataId: keepId },
                select: { id: true },
            });
            if (!keepInstructor) {
                // Move a ficha inteira: os cursos apontam para UserInstructor.id.
                await t.userInstructor.updateMany({
                    where: { userDataId: removeId },
                    data: { userDataId: keepId },
                });
            }

            // Acesso ao painel: o use case garante que no máximo um dos dois tem.
            await t.userAdmin.updateMany({
                where: { userDataId: removeId },
                data: { userDataId: keepId },
            });
            await t.adminInvite.updateMany({
                where: { userDataId: removeId },
                data: { userDataId: keepId },
            });
            await t.roomBooking.updateMany({
                where: { responsibleUserDataId: removeId },
                data: { responsibleUserDataId: keepId },
            });

            await t.userData.update({
                where: { id: removeId },
                data: { isDeleted: true,
deletedAt: now },
            });
            if (Object.keys(fill).length > 0) {
                await t.userData.update({ where: { id: keepId },
data: fill });
            }

            return {
                movedRegistrations: moveRegIds.length,
                movedCompanies: moveMemberIds.length,
                movedProperties: movedProps.count,
                movedRelations,
            };
        });
    }
}

/**
 * Passa as relações do cadastro removido para o que fica, nas duas direções.
 * Relação repetida (os dois ligados à mesma pessoa, no mesmo sentido) é
 * descartada por exclusão lógica em vez de virar uma linha duplicada.
 */
async function moveRelations(
    t: PrismaClient,
    keepId: string,
    removeId: string,
    now: Date,
): Promise<number> {
    const select = { id: true,
sourceId: true,
targetId: true };
    const keepRels: {
 id: string;
sourceId: string;
targetId: string 
}[] =
        await t.userRelation.findMany({
            where: { isDeleted: false,
OR: [{ sourceId: keepId }, { targetId: keepId }] },
            select,
        });
    const pairs = new Set(
        keepRels.map(r => (r.sourceId === keepId ? `s:${r.targetId}` : `t:${r.sourceId}`)),
    );
    const removeRels: {
 id: string;
sourceId: string;
targetId: string 
}[] =
        await t.userRelation.findMany({
            where: { isDeleted: false,
OR: [{ sourceId: removeId }, { targetId: removeId }] },
            select,
        });

    const duplicated: string[] = [];
    const asSource: string[] = [];
    const asTarget: string[] = [];
    for (const rel of removeRels) {
        const isSource = rel.sourceId === removeId;
        const other = isSource ? rel.targetId : rel.sourceId;
        const pair = `${isSource ? 's' : 't'}:${other}`;
        if (pairs.has(pair)) {
            duplicated.push(rel.id);
            continue;
        }
        pairs.add(pair);
        (isSource ? asSource : asTarget).push(rel.id);
    }
    if (duplicated.length > 0) {
        await t.userRelation.updateMany({
            where: { id: { in: duplicated } },
            data: { isDeleted: true,
deletedAt: now },
        });
    }
    if (asSource.length > 0) {
        await t.userRelation.updateMany({
            where: { id: { in: asSource } },
            data: { sourceId: keepId },
        });
    }
    if (asTarget.length > 0) {
        await t.userRelation.updateMany({
            where: { id: { in: asTarget } },
            data: { targetId: keepId },
        });
    }
    return asSource.length + asTarget.length;
}
