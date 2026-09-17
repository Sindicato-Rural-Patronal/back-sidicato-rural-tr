import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client.js';
import { hash } from 'bcrypt';
import { Permission } from '../../generated/prisma/enums.js';
import type { FastifyInstance } from 'fastify';

export const E2E_ADMIN_USERNAME = 'e2eadmin';
export const E2E_ADMIN_PASSWORD = 'e2ePassword123!';

// Todas as permissões que existem no enum (inclusive as criadas depois dos testes).
const ALL_PERMISSIONS = Object.values(Permission);

export function createTestPrisma(): PrismaClient {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL not set in E2E test worker');
    const adapter = new PrismaPg({ connectionString: url });
    return new PrismaClient({ adapter });
}

/**
 * Wipe all application tables in safe dependency order.
 * Called in beforeAll of each E2E test file for isolation.
 */
export async function cleanDatabase(prisma: PrismaClient): Promise<void> {
    await prisma.$executeRawUnsafe(`
        TRUNCATE TABLE
            "courseUserRegistration",
            "CourseInstructor",
            "CoursePhoto",
            "course",
            "room",
            "Property",
            "PublicContact",
            "GalleryPhoto",
            "GalleryAlbum",
            "CompanyMember",
            "Company",
            "UserRelation",
            "UserInstructor",
            "UserAdmin",
            "UserData",
            "Rule",
            "Address",
            "News",
            "Banner",
            "ContactMessage"
        RESTART IDENTITY CASCADE
    `);
}

export async function seedSuperAdmin(prisma: PrismaClient) {
    const rule = await prisma.rule.create({
        data: {
            name: 'SUPER_RULE',
            description: 'E2E super admin rule',
            permissions: ALL_PERMISSIONS,
        },
    });

    const userData = await prisma.userData.create({
        data: {
            name: 'E2E Admin',
            email: 'e2eadmin@test.local',
            phone: '44900000000',
        },
    });

    const userAdmin = await prisma.userAdmin.create({
        data: {
            username: E2E_ADMIN_USERNAME,
            passwordHash: await hash(E2E_ADMIN_PASSWORD, 4),
            userDataId: userData.id,
            rulesId: rule.id,
        },
    });

    return { rule,
userData,
userAdmin };
}

export async function loginAndGetToken(
    app: FastifyInstance,
    username = E2E_ADMIN_USERNAME,
    password = E2E_ADMIN_PASSWORD,
): Promise<string> {
    const res = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { username,
password },
    });
    if (res.statusCode !== 200) {
        throw new Error(`E2E login failed (${res.statusCode}): ${res.body}`);
    }
    return (JSON.parse(res.body) as { token: string }).token;
}

export function bearer(token: string): { authorization: string } {
    return { authorization: `Bearer ${token}` };
}
