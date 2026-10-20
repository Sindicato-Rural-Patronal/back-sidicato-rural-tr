import type { FastifyInstance } from 'fastify';
import { publicRoute } from '../lib/route-auth.js';

// Healthcheck leve: responde que o processo está de pé, sem tocar no banco nem
// no storage (quem precisa saber do banco consulta uma rota de dados). Pública,
// como o `GET /` do servidor, mas declarada como as demais rotas da API.
export async function healthRouter(fastify: FastifyInstance) {
    fastify.get(
        '/health',
        {
            config: { auth: publicRoute() },
            schema: {
                tags: ['Health'],
                summary: 'Health check leve',
                description: 'Responde 200 `{ status: "ok" }` sem consultar o banco nem o storage.',
                response: {
                    200: {
                        type: 'object',
                        properties: { status: { type: 'string',
example: 'ok' } },
                    },
                },
            },
        },
        async () => ({ status: 'ok' }),
    );
}
