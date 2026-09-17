// De onde veio a requisição, para a trilha de auditoria: IP do cliente e o
// navegador/aparelho (User-Agent). Em produção `request.ip` já é o IP real
// (trustProxy: 1 em src/index.ts).

export type RequestContext = {
    ip: string | null;
    userAgent: string | null;
};

export const USER_AGENT_MAX = 300;

/** "::ffff:200.1.2.3" (IPv4 dentro de IPv6) → "200.1.2.3"; vazio → null. */
export function normalizeIp(ip: string | null | undefined): string | null {
    const value = (ip ?? '').trim();
    if (!value) return null;
    const mapped = value.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
    return (mapped ? mapped[1] : value).slice(0, 64);
}

/** User-Agent bruto, cortado em 300 caracteres; vazio → null. */
export function normalizeUserAgent(ua: string | string[] | null | undefined): string | null {
    const value = (Array.isArray(ua) ? ua[0] : ua ?? '').trim();
    return value ? value.slice(0, USER_AGENT_MAX) : null;
}

export function requestContext(request: {
    ip?: string;
    headers: Record<string, string | string[] | undefined>;
}): RequestContext {
    return {
        ip: normalizeIp(request.ip),
        userAgent: normalizeUserAgent(request.headers['user-agent']),
    };
}
