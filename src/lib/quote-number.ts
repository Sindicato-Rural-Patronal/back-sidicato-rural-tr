// Extrai o número de um valor de cotação em texto livre (formato BR: '.' de
// milhar, ',' decimal). Ex.: "R$ 1.234,50 /sc" → 1234.5 ; "R$ 5,00" → 5.
export function parseQuoteNumber(v: string | null | undefined): number | null {
    if (!v) return null;
    const m = v.match(/-?\d{1,3}(?:\.\d{3})+(?:,\d+)?|-?\d+(?:[.,]\d+)?/);
    if (!m) return null;
    let s = m[0];
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.'); // BR
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : null;
}

// Variação percentual formatada (ex.: "+1,2%" / "-0,8%"). null se não dá pra
// calcular (sem valor anterior, sem número, ou base zero).
export function formatVariation(prev: number | null, next: number | null): string | null {
    if (prev == null || next == null || prev === 0) return null;
    const pct = ((next - prev) / prev) * 100;
    const sign = pct > 0 ? '+' : pct < 0 ? '-' : '';
    return `${sign}${Math.abs(pct).toFixed(1).replace('.', ',')}%`;
}
