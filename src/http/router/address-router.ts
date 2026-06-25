import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client/extension';
import { createAddressAdapter } from '../../adapter/database/address-adapter.js';
import { FetchAddressByCepUseCase } from '../../usecase/fetch-address-by-cep.js';
import { FetchAddressByCepController } from '../controllers/fetch-address-by-cep.js';

export async function addressRouter(fastify: FastifyInstance, prisma: PrismaClient) {
    const addressRepo = createAddressAdapter(prisma);
    const fetchAddressByCepController = new FetchAddressByCepController(
        new FetchAddressByCepUseCase(addressRepo),
    );

    fastify.get(
        '/address/cep/:cep',
        {
            schema: {
                tags: ['Address'],
                summary: 'Fetch address data by CEP (zip code)',
                description:
                    'Searches locally first; falls back to ViaCEP API and caches the result.',
                params: {
                    type: 'object',
                    properties: { cep: { type: 'string', example: '85990000' } },
                    required: ['cep'],
                },
                response: {
                    200: {
                        type: 'object',
                        properties: {
                            id: { type: 'string' },
                            type: { type: 'string' },
                            zipCode: { type: 'string' },
                            street: { type: 'string', nullable: true },
                            neighborhood: { type: 'string', nullable: true },
                            city: { type: 'string', nullable: true },
                            state: { type: 'string', nullable: true },
                        },
                    },
                    404: { type: 'object', properties: { error: { type: 'string' } } },
                },
            },
        },
        (req, res) =>
            fetchAddressByCepController.handle(
                req as Parameters<typeof fetchAddressByCepController.handle>[0],
                res,
            ),
    );
}
