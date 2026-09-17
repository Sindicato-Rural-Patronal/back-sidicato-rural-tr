import { BlockList, isIP } from 'node:net';
import { normalizeIp } from './request-context.js';

// Local aproximado (cidade, UF, país) de um IP para a trilha de auditoria.
// Consulta o ipwho.is (HTTPS, sem chave; o IP do cliente é enviado a esse
// serviço). Nunca lança: qualquer falha vira `null`. Cache em memória por IP.
// Desligado nos testes (NODE_ENV=test) e com GEOIP_DISABLED=1.

export const GEOIP_URL = 'https://ipwho.is';

// Faixas que não saem na internet (rede local, loopback, documentação...): não consulta.
const NON_PUBLIC = new BlockList();
const V4: [string, number][] = [
    ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
    ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
    ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
];
const V6: [string, number][] = [
    ['::', 127], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8], ['2001:db8::', 32], ['100::', 64],
];
for (const [net, prefix] of V4) NON_PUBLIC.addSubnet(net, prefix, 'ipv4');
for (const [net, prefix] of V6) NON_PUBLIC.addSubnet(net, prefix, 'ipv6');

/** IP válido e roteável na internet (fora de rede local/loopback/reservado). */
export function isPublicIp(ip: string | null | undefined): boolean {
    const addr = normalizeIp(ip);
    if (!addr) return false;
    const family = isIP(addr);
    if (!family) return false;
    try {
        return !NON_PUBLIC.check(addr, family === 4 ? 'ipv4' : 'ipv6');
    } catch {
        return false;
    }
}

type GeoResponse = {
    success?: boolean;
    city?: unknown;
    region?: unknown;
    region_code?: unknown;
    country?: unknown;
};

const clean = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** "Cidade, UF, País" com o que o serviço devolveu (partes ausentes ficam de fora). */
export function formatLocation(data: GeoResponse | null | undefined): string | null {
    if (!data || data.success === false) return null;
    const code = clean(data.region_code);
    // Sigla curta (PR, SP, CA) quando existe; senão o nome da região.
    const region = code && /^[A-Za-z]{2,3}$/.test(code) ? code.toUpperCase() : clean(data.region);
    const parts = [clean(data.city), region, clean(data.country)].filter((p): p is string => !!p);
    return parts.length ? parts.join(', ').slice(0, 120) : null;
}

export type GeoLocatorOptions = {
    fetch?: typeof fetch;
    enabled?: () => boolean;
    timeoutMs?: number;
    /** Validade do resultado no cache (padrão 24 h). */
    ttlMs?: number;
    /** Validade de uma falha (serviço fora/limite): tenta de novo depois (padrão 10 min). */
    failureTtlMs?: number;
    maxEntries?: number;
    /** Teto de consultas ao serviço por minuto (padrão 30); acima disso fica sem local. */
    budgetPerMinute?: number;
    now?: () => number;
};

/**
 * Chave do cache: o próprio IPv4, ou o prefixo /64 do IPv6 (quem troca de
 * endereço dentro da mesma rede não gera uma consulta por endereço).
 */
export function geoCacheKey(ip: string): string {
    if (isIP(ip) !== 6) return ip;
    const [head, tail = ''] = ip.toLowerCase().split('::');
    const left = head ? head.split(':') : [];
    const right = tail ? tail.split(':') : [];
    const groups = ip.includes('::')
        ? [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill('0'), ...right]
        : left;
    return `${groups.slice(0, 4).map(g => g.replace(/^0+(?=.)/, '')).join(':')}::/64`;
}

export function createGeoLocator(options: GeoLocatorOptions = {}) {
    const doFetch = options.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
    const enabled = options.enabled ?? (() => process.env.NODE_ENV !== 'test' && process.env.GEOIP_DISABLED !== '1');
    const timeoutMs = options.timeoutMs ?? 2000;
    const ttlMs = options.ttlMs ?? 24 * 60 * 60 * 1000;
    const failureTtlMs = options.failureTtlMs ?? 10 * 60 * 1000;
    const maxEntries = options.maxEntries ?? 1000;
    const budgetPerMinute = options.budgetPerMinute ?? 30;
    const now = options.now ?? Date.now;
    let budgetWindowStart = 0;
    let budgetUsed = 0;

    // Proteção contra enxurrada de IPs novos (ataque): o serviço gratuito tem
    // limite e poderia bloquear o servidor para todos.
    function takeBudget(): boolean {
        const t = now();
        if (t - budgetWindowStart >= 60_000) {
            budgetWindowStart = t;
            budgetUsed = 0;
        }
        if (budgetUsed >= budgetPerMinute) return false;
        budgetUsed++;
        return true;
    }

    const cache = new Map<string, {
        value: string | null;
        expiresAt: number;
    }>();
    const pending = new Map<string, Promise<string | null>>();

    function remember(ip: string, value: string | null, ttl: number) {
        cache.delete(ip);
        // Limite de tamanho: sai o mais antigo (Map mantém a ordem de inserção).
        while (cache.size >= maxEntries) {
            const oldest = cache.keys().next().value;
            if (oldest === undefined) break;
            cache.delete(oldest);
        }
        cache.set(ip, { value,
expiresAt: now() + ttl });
    }

    async function fetchLocation(ip: string): Promise<{
        value: string | null;
        ok: boolean;
    }> {
        try {
            const url = `${GEOIP_URL}/${encodeURIComponent(ip)}?lang=pt-BR&fields=success,city,region,region_code,country`;
            const res = await doFetch(url, { signal: AbortSignal.timeout(timeoutMs),
headers: { accept: 'application/json' } });
            if (!res.ok) return { value: null,
ok: false };
            const data = (await res.json()) as GeoResponse;
            return { value: formatLocation(data),
ok: data?.success !== false };
        } catch {
            return { value: null,
ok: false };
        }
    }

    /** Local do IP ou `null` (desligado, IP local, serviço fora do ar, demora > timeout). */
    function lookup(ip: string | null | undefined): Promise<string | null> {
        const addr = normalizeIp(ip);
        if (!addr || !enabled() || !isPublicIp(addr)) return Promise.resolve(null);
        const key = geoCacheKey(addr);
        const hit = cache.get(key);
        if (hit && hit.expiresAt > now()) return Promise.resolve(hit.value);
        const inFlight = pending.get(key);
        if (inFlight) return inFlight;
        if (!takeBudget()) return Promise.resolve(null);
        const promise = fetchLocation(addr)
            .then(({ value, ok }) => {
                remember(key, value, ok ? ttlMs : failureTtlMs);
                return value;
            })
            .catch(() => null)
            .finally(() => pending.delete(key));
        pending.set(key, promise);
        return promise;
    }

    return {
        lookup,
        clear() {
            cache.clear();
            pending.clear();
        },
    };
}

const defaultLocator = createGeoLocator();

/** Local aproximado do IP ("Terra Roxa, PR, Brasil") ou `null`. Nunca lança. */
export function lookupLocation(ip: string | null | undefined): Promise<string | null> {
    return defaultLocator.lookup(ip);
}
