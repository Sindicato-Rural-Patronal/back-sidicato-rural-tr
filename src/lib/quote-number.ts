// Variação percentual formatada (ex.: "+1,2%" / "-0,8%"). null se não dá pra
// calcular (sem valor anterior, sem número, ou base zero).
export function formatVariation(prev: number | null, next: number | null): string | null {
    if (prev == null || next == null || prev === 0) return null;
    const pct = ((next - prev) / prev) * 100;
    const sign = pct > 0 ? '+' : pct < 0 ? '-' : '';
    return `${sign}${Math.abs(pct).toFixed(1).replace('.', ',')}%`;
}
