import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fastify, { type FastifyInstance } from 'fastify';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { registerRouters } from '../register-routers.js';
import { routeKey, type RouteAuthEntry } from '../lib/route-auth.js';

// Toda rota da API declara o que exige (decisão 001, SR-023). Monta as rotas
// de verdade, sem banco (os routers só usam o Prisma dentro dos handlers), e
// confere a declaração de cada uma.

/**
 * As rotas públicas, com o motivo. Tornar uma rota pública exige mexer aqui
 * também, e isso aparece na revisão.
 */
const ROTAS_PUBLICAS: Record<string, string> = {
    'POST /auth/login': 'é o login; limite próprio de 10 em 5 min',
    'GET /banners': 'carrossel da home',
    'GET /contacts': '"Nossa Equipe": nome, e-mail e telefone publicados de propósito pelo painel',
    'POST /contacts/message': 'formulário de contato; limite por IP',
    'GET /convenios': 'menu do site',
    'GET /convenios/:slug': 'página do convênio; inativo dá 404',
    'GET /courses': 'lista do site',
    'GET /courses/:courseId': 'página do curso; curso PRIVATE abre pelo link de propósito',
    'POST /courses/:courseId/register-by-cpf': 'inscrição de quem tem cadastro: CPF + final do telefone; limite por IP e por CPF',
    'POST /courses/:courseId/register-full': 'inscrição de quem não tem cadastro; limite por IP e por CPF',
    'GET /events': 'eventos marcados "no site"; a descrição interna não sai',
    'GET /health': 'healthcheck leve: só diz que o processo está de pé, sem banco nem storage',
    'GET /galleries': 'galerias da página Sobre',
    'GET /invites/:token': 'o token tem 256 bits e expira',
    'POST /invites/:token/accept': 'o token tem 256 bits e expira',
    'GET /market-quotes': 'faixa de cotações e /cotacao',
    'GET /market-quotes/history': 'página de histórico; days de 7 a 365',
    'GET /news': 'lista do site',
    'GET /news/:newsId': 'rascunho e agendada dão 404',
    'GET /partners': 'parceiros da home',
    'GET /site-settings': 'só as chaves exibidas no site',
    'POST /users/lookup-cpf': 'primeiro passo da inscrição: CPF + final do telefone; limite por IP e por CPF',
};

/** Rota pública que grava ou recebe CPF e fica sem limite próprio, com o motivo. */
const SEM_LIMITE_PROPRIO: Record<string, string> = {
    'POST /invites/:token/accept': 'depende de um token de 256 bits, de uso único',
};

let app: FastifyInstance;
const inventory: RouteAuthEntry[] = [];

beforeAll(async () => {
    app = fastify({ logger: false,
ajv: { customOptions: { keywords: ['example'] } } });
    registerRouters(app, {} as PrismaClient, inventory);
    await app.ready();
});

afterAll(async () => {
    await app.close();
});

// O HEAD que o Fastify cria para cada GET não conta.
const routes = () => inventory.filter(r => r.method !== 'HEAD');
const keys = (list: RouteAuthEntry[]) => list.map(r => routeKey(r.method, r.url)).sort();

describe('inventário de autorização das rotas', () => {
    it('monta as rotas', () => {
        expect(routes().length).toBeGreaterThan(150);
        expect(new Set(keys(routes())).size).toBe(routes().length);
    });

    it('toda rota declara o que exige', () => {
        expect(keys(routes().filter(r => !r.auth))).toEqual([]);
    });

    it('as rotas públicas são exatamente as de ROTAS_PUBLICAS', () => {
        expect(keys(routes().filter(r => r.auth?.kind === 'public'))).toEqual(Object.keys(ROTAS_PUBLICAS).sort());
    });

    it('rota pública que grava ou recebe CPF tem limite por IP próprio', () => {
        const unlimited = routes()
            .filter(r => r.auth?.kind === 'public')
            .filter(r => r.method !== 'GET' || r.url.includes('cpf'))
            .filter(r => !r.rateLimited)
            .map(r => routeKey(r.method, r.url))
            .filter(k => !(k in SEM_LIMITE_PROPRIO));
        expect(unlimited).toEqual([]);
    });
});
