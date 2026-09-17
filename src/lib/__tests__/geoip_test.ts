import { describe, it, expect, vi } from 'vitest';
import { createGeoLocator, formatLocation, geoCacheKey, isPublicIp, lookupLocation } from '../geoip.js';
import { normalizeIp, normalizeUserAgent, requestContext } from '../request-context.js';

const okResponse = (body: unknown) => new Response(JSON.stringify(body), { status: 200,
headers: { 'content-type': 'application/json' } });

const TERRA_ROXA = { success: true,
city: 'Terra Roxa',
region: 'Paraná',
region_code: 'PR',
country: 'Brasil' };

describe('IP e User-Agent da requisição', () => {
    it('IPv4 dentro de IPv6 vira IPv4; vazio vira null', () => {
        expect(normalizeIp('::ffff:200.1.2.3')).toBe('200.1.2.3');
        expect(normalizeIp('2804:14c::1')).toBe('2804:14c::1');
        expect(normalizeIp('')).toBeNull();
        expect(normalizeIp(undefined)).toBeNull();
    });

    it('User-Agent cortado em 300 caracteres', () => {
        expect(normalizeUserAgent('x'.repeat(500))).toHaveLength(300);
        expect(normalizeUserAgent('  ')).toBeNull();
        expect(requestContext({ ip: '::ffff:8.8.8.8',
headers: { 'user-agent': 'curl/8.0' } })).toEqual({ ip: '8.8.8.8',
userAgent: 'curl/8.0' });
    });
});

describe('geolocalização do IP: proteção contra enxurrada', () => {
    it('IPv6 da mesma rede /64 usa a mesma chave; IPv4 fica igual', () => {
        expect(geoCacheKey('2804:14c:5b80:1::1')).toBe('2804:14c:5b80:1::/64');
        expect(geoCacheKey('2804:14c:5b80:1:aaaa:bbbb:cccc:dddd')).toBe('2804:14c:5b80:1::/64');
        expect(geoCacheKey('2804::1')).toBe('2804:0:0:0::/64');
        expect(geoCacheKey('177.8.8.8')).toBe('177.8.8.8');
    });

    it('endereços da mesma rede /64 consultam o serviço uma vez só', async () => {
        const fetchMock = vi.fn(async () => okResponse(TERRA_ROXA));
        const geo = createGeoLocator({ fetch: fetchMock as never,
enabled: () => true });
        expect(await geo.lookup('2804:14c:5b80:1::1')).toBe('Terra Roxa, PR, Brasil');
        expect(await geo.lookup('2804:14c:5b80:1::2')).toBe('Terra Roxa, PR, Brasil');
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('acima do teto por minuto não consulta (fica sem local) e volta no minuto seguinte', async () => {
        let t = 0;
        const fetchMock = vi.fn(async () => okResponse(TERRA_ROXA));
        const geo = createGeoLocator({ fetch: fetchMock as never,
enabled: () => true,
budgetPerMinute: 2,
now: () => t });
        expect(await geo.lookup('8.8.8.1')).not.toBeNull();
        expect(await geo.lookup('8.8.8.2')).not.toBeNull();
        expect(await geo.lookup('8.8.8.3')).toBeNull();
        expect(fetchMock).toHaveBeenCalledTimes(2);
        t = 61_000;
        expect(await geo.lookup('8.8.8.3')).not.toBeNull();
        expect(fetchMock).toHaveBeenCalledTimes(3);
    });
});

describe('geolocalização do IP', () => {
    it('rede local, loopback e faixas reservadas não são públicas', () => {
        for (const ip of ['127.0.0.1', '10.0.0.5', '172.20.1.1', '192.168.0.10', '169.254.1.1', '100.64.0.1', '::1', 'fe80::1', 'fd00::1', '::ffff:192.168.1.1', '0.0.0.0', 'abc', '']) {
            expect(isPublicIp(ip), ip).toBe(false);
        }
        for (const ip of ['8.8.8.8', '177.8.8.8', '2804:14c:5b80::1']) {
            expect(isPublicIp(ip), ip).toBe(true);
        }
    });

    it('formata "Cidade, UF, País" com o que veio', () => {
        expect(formatLocation(TERRA_ROXA)).toBe('Terra Roxa, PR, Brasil');
        expect(formatLocation({ success: true,
city: 'San Jose',
region: 'California',
region_code: 'CA',
country: 'Estados Unidos' })).toBe('San Jose, CA, Estados Unidos');
        // Sigla estranha: usa o nome da região.
        expect(formatLocation({ success: true,
region: 'Île-de-France',
region_code: '11',
country: 'França' })).toBe('Île-de-France, França');
        expect(formatLocation({ success: false })).toBeNull();
        expect(formatLocation({ success: true })).toBeNull();
    });

    it('consulta o serviço por HTTPS e guarda no cache', async () => {
        const fetchMock = vi.fn().mockResolvedValue(okResponse(TERRA_ROXA));
        const geo = createGeoLocator({ fetch: fetchMock,
enabled: () => true });

        expect(await geo.lookup('177.8.8.8')).toBe('Terra Roxa, PR, Brasil');
        expect(await geo.lookup('177.8.8.8')).toBe('Terra Roxa, PR, Brasil');
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(String(fetchMock.mock.calls[0][0])).toMatch(/^https:\/\/ipwho\.is\/177\.8\.8\.8\?/);
    });

    it('consultas simultâneas do mesmo IP viram uma só', async () => {
        const fetchMock = vi.fn().mockResolvedValue(okResponse(TERRA_ROXA));
        const geo = createGeoLocator({ fetch: fetchMock,
enabled: () => true });
        const [a, b] = await Promise.all([geo.lookup('177.8.8.8'), geo.lookup('177.8.8.8')]);
        expect(a).toBe(b);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('cache expira e tem tamanho limitado', async () => {
        let now = 0;
        const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(okResponse(TERRA_ROXA)));
        const geo = createGeoLocator({ fetch: fetchMock,
enabled: () => true,
ttlMs: 1000,
maxEntries: 2,
now: () => now });

        await geo.lookup('8.8.8.8');
        now = 2000;
        await geo.lookup('8.8.8.8');
        expect(fetchMock).toHaveBeenCalledTimes(2);

        await geo.lookup('8.8.4.4');
        await geo.lookup('1.1.1.1'); // tira o mais antigo (8.8.8.8)
        await geo.lookup('8.8.8.8');
        expect(fetchMock).toHaveBeenCalledTimes(5);
    });

    it('IP local não consulta nada', async () => {
        const fetchMock = vi.fn();
        const geo = createGeoLocator({ fetch: fetchMock,
enabled: () => true });
        expect(await geo.lookup('192.168.0.10')).toBeNull();
        expect(await geo.lookup(null)).toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('desligado (testes / GEOIP_DISABLED=1) não consulta nada', async () => {
        const fetchMock = vi.fn();
        expect(await createGeoLocator({ fetch: fetchMock,
enabled: () => false }).lookup('8.8.8.8')).toBeNull();
        // Instância padrão: NODE_ENV=test nos testes.
        expect(await lookupLocation('8.8.8.8')).toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('serviço lento: desiste no timeout sem lançar', async () => {
        const fetchMock = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
        }));
        const geo = createGeoLocator({ fetch: fetchMock as unknown as typeof fetch,
enabled: () => true,
timeoutMs: 20 });
        expect(await geo.lookup('8.8.8.8')).toBeNull();
    });

    it('erro de rede, HTTP de erro ou resposta sem sucesso → null, tenta de novo depois', async () => {
        let now = 0;
        const fetchMock = vi.fn()
            .mockRejectedValueOnce(new Error('offline'))
            .mockResolvedValueOnce(new Response('limite', { status: 429 }))
            .mockResolvedValueOnce(okResponse({ success: false,
message: 'limit' }))
            .mockResolvedValueOnce(okResponse(TERRA_ROXA));
        const geo = createGeoLocator({ fetch: fetchMock,
enabled: () => true,
failureTtlMs: 10,
now: () => now });

        expect(await geo.lookup('8.8.8.8')).toBeNull();
        expect(await geo.lookup('8.8.8.8')).toBeNull(); // ainda no cache da falha
        expect(fetchMock).toHaveBeenCalledTimes(1);
        now = 20;
        expect(await geo.lookup('8.8.8.8')).toBeNull();
        now = 40;
        expect(await geo.lookup('8.8.8.8')).toBeNull();
        now = 60;
        expect(await geo.lookup('8.8.8.8')).toBe('Terra Roxa, PR, Brasil');
    });
});
