import type { FastifyRequest, FastifyReply } from 'fastify';
import { decodeToken } from '../../lib/auth.js';
import type { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';
import { NotFoundError } from '../../errors/not-found.js';
import { ConflictError } from '../../errors/conflict.js';
import { AuthError } from '../../errors/auth.js';

export function errorToStatus(err: Error | undefined): number {
    if (!err) return 400;
    if (err instanceof NotFoundError) return 404;
    if (err instanceof ConflictError) return 409;
    if (err instanceof AuthError) return 401;
    return 400;
}

export async function requirePermission(
    request: FastifyRequest,
    reply: FastifyReply,
    permission: string,
    getAdminPermissions: GetAdminPermissionsUseCase,
): Promise<string | null> {
    const token = request.headers['authorization']?.replace('Bearer ', '') ?? '';
    const decoded = decodeToken(token);
    if (!decoded) {
        reply.status(401).send({ error: 'Unauthorized' });
        return null;
    }
    const permissions = await getAdminPermissions.execute(decoded.userId);
    if (!permissions) {
        reply.status(401).send({ error: 'Admin not found' });
        return null;
    }
    if (!permissions.includes(permission)) {
        reply.status(403).send({ error: 'Forbidden' });
        return null;
    }
    return decoded.userId;
}

export async function requireAuth(
    request: FastifyRequest,
    reply: FastifyReply,
    getAdminPermissions: GetAdminPermissionsUseCase,
): Promise<string | null> {
    const token = request.headers['authorization']?.replace('Bearer ', '') ?? '';
    const decoded = decodeToken(token);
    if (!decoded) {
        reply.status(401).send({ error: 'Unauthorized' });
        return null;
    }
    const permissions = await getAdminPermissions.execute(decoded.userId);
    if (!permissions) {
        reply.status(401).send({ error: 'Admin not found' });
        return null;
    }
    return decoded.userId;
}
