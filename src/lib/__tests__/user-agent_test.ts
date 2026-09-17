import { describe, it, expect } from 'vitest';
import { describeUserAgent } from '../user-agent.js';

describe('aparelho pelo User-Agent', () => {
    it.each([
        ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36', 'Chrome no Windows'],
        ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.2478.51', 'Edge no Windows'],
        ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1', 'Safari no iPhone'],
        ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0.6367.88 Mobile/15E148 Safari/604.1', 'Chrome no iPhone'],
        ['Mozilla/5.0 (Android 14; Mobile; rv:125.0) Gecko/125.0 Firefox/125.0', 'Firefox no Android'],
        ['Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/24.0 Chrome/117.0.0.0 Mobile Safari/537.36', 'Samsung Internet no Android'],
        ['Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36', 'Chrome no Android'],
        ['Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15', 'Safari no macOS'],
        ['Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0', 'Firefox no Linux'],
        ['Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1', 'Safari no iPad'],
        ['curl/8.4.0', 'curl'],
        ['PostmanRuntime/7.37.3', 'Postman'],
        ['python-requests/2.31.0', 'Python'],
        ['Mozilla/5.0 (Windows NT 10.0) Trident/7.0', 'Navegador no Windows'],
        ['qualquer coisa', 'Outro'],
        ['', 'Outro'],
    ])('%s → %s', (ua, label) => {
        expect(describeUserAgent(ua)).toBe(label);
    });

    it('sem User-Agent → "Outro"', () => {
        expect(describeUserAgent(null)).toBe('Outro');
        expect(describeUserAgent(undefined)).toBe('Outro');
    });
});
