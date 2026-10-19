import type { FastifyInstance, FastifyRequest, RouteOptions } from 'fastify';
import type { Permission } from '../../generated/prisma/enums.js';
import { decodeToken } from '../../lib/auth.js';
import type { GetAdminPermissionsUseCase } from '../../usecase/get-admin-permissions.js';

// Autorização declarada na rota (decisão 001 da Arquitetura, SR-023).
//
// Toda rota diz o que exige em `config.auth`:
//   publicRoute()                    qualquer um
//   loggedIn()                       qualquer admin com login válido
//   requires('READ_USER', ...)       todas as permissões listadas
//   requiresFrom(req => [...] | null) permissões calculadas por params/query
//                                    (sem corpo: a checagem roda antes de lê-lo);
//                                    null = só o login
//
// Um hook `onRequest` faz a checagem antes do parse do corpo, então upload sem
// permissão é recusado sem ser lido. Rota sem declaração responde 500 (fica
// fechada, não aberta) e o teste de inventário reprova. Rota pública nova entra
// também em ROTAS_PUBLICAS (http/__tests__/route-auth-inventory_test.ts), com
// o motivo.
//
// A declaração também escreve o Swagger: rota não pública ganha `bearerAuth` e
// a permissão no fim da descrição.

export type AdminContext = {
    id: string;
    permissions: readonly string[];
    has(permission: Permission): boolean;
};

type PermissionsFrom = (request: FastifyRequest) => Permission[] | null;

export type RouteAuth =
    | { kind: 'public' }
    | { kind: 'loggedIn' }
    | {
 kind: 'requires';
permissions: Permission[] 
}
    | {
 kind: 'requiresFrom';
from: PermissionsFrom 
};

declare module 'fastify' {
    interface FastifyContextConfig {
        auth?: RouteAuth;
    }
    interface FastifyRequest {
        /** Quem chamou, preenchido pelo hook nas rotas que exigem login. null nas públicas. */
        admin: AdminContext | null;
    }
}

export const publicRoute = (): RouteAuth => ({ kind: 'public' });
export const loggedIn = (): RouteAuth => ({ kind: 'loggedIn' });
/** Mais de uma permissão = todas. */
export const requires = (...permissions: [Permission, ...Permission[]]): RouteAuth => ({ kind: 'requires',
permissions });
export const requiresFrom = (from: PermissionsFrom): RouteAuth => ({ kind: 'requiresFrom',
from });

export type RouteAuthEntry = {
    method: string;
    url: string;
    auth: RouteAuth | undefined;
    rateLimited: boolean;
};

/** "GET /admin/users/:id": a chave das rotas nos testes e no log. */
export const routeKey = (method: string, url: string) => `${method} ${url}`;

type PermissionsSource = Pick<GetAdminPermissionsUseCase, 'execute'>;

type Options = {
    /** Recebe uma linha por rota (para os testes). */
    inventory?: RouteAuthEntry[];
};

/**
 * Registra os routers da API dentro de um plugin com a checagem. O health
 * check, o Swagger e o OPTIONS do CORS ficam na raiz, fora dele.
 */
export function withRouteAuth(
    app: FastifyInstance,
    getAdminPermissions: PermissionsSource,
    registerApiRoutes: (api: FastifyInstance) => void,
    { inventory }: Options = {},
) {
    if (!app.hasRequestDecorator('admin')) app.decorateRequest('admin', null);

    app.register(async api => {
        api.addHook('onRoute', (route: RouteOptions) => {
            documentAuth(route);
            if (!inventory) return;
            const methods = Array.isArray(route.method) ? route.method : [route.method];
            for (const method of methods) {
                inventory.push({
                    method,
                    url: route.url,
                    auth: route.config?.auth,
                    rateLimited: Boolean(route.config?.rateLimit),
                });
            }
        });

        api.addHook('onRequest', async (request, reply) => {
            const denied = await checkRouteAuth(request, getAdminPermissions);
            if (denied) {
                if (denied.status === 500) request.log.error({ route: routeOf(request) }, 'Rota sem regra de acesso');
                return reply.status(denied.status).send({ error: denied.error });
            }
        });

        registerApiRoutes(api);
    });
}

/** O que a rota exige, em texto, para o Swagger. */
function describeAuth(auth: RouteAuth): string {
    if (auth.kind === 'requires') return `Exige: ${auth.permissions.join(' e ')}.`;
    if (auth.kind === 'requiresFrom') return 'Exige login e a permissão do conjunto pedido.';
    return 'Exige login.';
}

/**
 * O Swagger passa a dizer a verdade sozinho: o `security` e a permissão saem
 * da declaração. O @fastify/swagger guarda a referência da rota e lê o schema
 * só ao montar o documento, então vê a troca feita aqui.
 */
function documentAuth(route: RouteOptions) {
    const auth = route.config?.auth;
    if (!auth || auth.kind === 'public') return;
    const schema = (route.schema ?? {}) as { description?: string };
    route.schema = {
        ...schema,
        security: [{ bearerAuth: [] }],
        description: [schema.description, describeAuth(auth)].filter(Boolean).join('\n\n'),
    } as RouteOptions['schema'];
}

function routeOf(request: FastifyRequest): string {
    // O HEAD que o Fastify cria para cada GET usa a declaração do GET.
    const method = request.routeOptions.method === 'HEAD' ? 'GET' : String(request.routeOptions.method);
    return routeKey(method, request.routeOptions.url ?? '');
}

type Denied = {
 status: number;
error: string 
} | null;

/** A checagem, na ordem da decisão 001. null = pode seguir. */
async function checkRouteAuth(
    request: FastifyRequest,
    getAdminPermissions: PermissionsSource,
): Promise<Denied> {
    // Sem rota (404 do Fastify): não há o que conferir.
    if (!request.routeOptions.url) return null;

    const auth = request.routeOptions.config?.auth;
    if (!auth) return { status: 500,
error: 'Rota sem regra de acesso.' };
    if (auth.kind === 'public') return null;

    const token = request.headers['authorization']?.replace('Bearer ', '') ?? '';
    const decoded = decodeToken(token);
    if (!decoded) return { status: 401,
error: 'Unauthorized' };
    const permissions = await getAdminPermissions.execute(decoded.userId);
    if (!permissions) return { status: 401,
error: 'Admin not found' };

    request.admin = {
        id: decoded.userId,
        permissions,
        has: (p: Permission) => permissions.includes(p),
    };
    if (auth.kind === 'loggedIn') return null;

    const needed = auth.kind === 'requires' ? auth.permissions : auth.from(request);
    if (needed && !needed.every(p => permissions.includes(p))) return { status: 403,
error: 'Forbidden' };
    return null;
}

/**
 * O admin da request, para os controllers das rotas declaradas. Só existe
 * depois do hook; chamar numa rota pública é erro de programação.
 */
export function adminOf(request: FastifyRequest): AdminContext {
    if (!request.admin) throw new Error('request.admin ausente: a rota não exige login');
    return request.admin;
}
