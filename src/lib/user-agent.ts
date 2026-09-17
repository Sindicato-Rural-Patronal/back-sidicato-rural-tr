// Rótulo curto do aparelho a partir do User-Agent ("Chrome no Windows",
// "Safari no iPhone"), para a trilha de auditoria. O texto bruto também é
// guardado; isto é só para leitura rápida. Ordem importa: vários navegadores
// se anunciam como "Chrome" e "Safari" ao mesmo tempo.

// Programas que não são navegador (script, linha de comando): aparecem pelo nome.
const TOOLS: [RegExp, string][] = [
    [/\bcurl\//i, 'curl'],
    [/\bwget\//i, 'Wget'],
    [/postmanruntime/i, 'Postman'],
    [/insomnia/i, 'Insomnia'],
    [/python-requests|python-urllib|aiohttp|httpx/i, 'Python'],
    [/\bnode-fetch|\bundici|\baxios|^node\b/i, 'Node.js'],
    [/go-http-client/i, 'Go'],
    [/okhttp/i, 'OkHttp'],
    [/bot\b|crawler|spider/i, 'Robô'],
];

const BROWSERS: [RegExp, string][] = [
    [/\bEdg(e|A|iOS)?\//, 'Edge'],
    [/\bOPR\/|\bOpera\b/, 'Opera'],
    [/SamsungBrowser\//, 'Samsung Internet'],
    [/\bFirefox\/|\bFxiOS\//, 'Firefox'],
    [/\bChrome\/|\bCriOS\//, 'Chrome'],
    [/\bVersion\/[\d.]+.*\bSafari\//, 'Safari'],
];

const SYSTEMS: [RegExp, string][] = [
    [/\biPhone\b/, 'iPhone'],
    [/\biPad\b/, 'iPad'],
    [/\bAndroid\b/, 'Android'],
    [/\bCrOS\b/, 'ChromeOS'],
    [/\bWindows\b/, 'Windows'],
    [/\bMac OS X\b|\bMacintosh\b/, 'macOS'],
    [/\bLinux\b/, 'Linux'],
];

const match = (list: [RegExp, string][], ua: string) => list.find(([re]) => re.test(ua))?.[1] ?? null;

/** "Chrome no Windows", "Firefox no Android", "curl"; sem pistas → "Outro". */
export function describeUserAgent(ua: string | null | undefined): string {
    const value = (ua ?? '').trim();
    if (!value) return 'Outro';
    const browser = match(BROWSERS, value);
    const system = match(SYSTEMS, value);
    if (!browser) {
        const tool = match(TOOLS, value);
        if (tool) return tool;
    }
    if (browser && system) return `${browser} no ${system}`;
    if (browser) return browser;
    if (system) return `Navegador no ${system}`;
    return 'Outro';
}
