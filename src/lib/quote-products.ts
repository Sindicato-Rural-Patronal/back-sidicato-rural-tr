// Cotações da home: produtos fixos (criados na migration) e formatação do valor.

export type QuotePeriod = 'MORNING' | 'AFTERNOON';

/**
 * Unidades que o painel pode escolher para cada produto (null = sem unidade,
 * caso do dólar). Saca, tonelada, quilo e arroba (15 kg).
 */
export const QUOTE_UNITS = ['sc 60kg', 'sc 50kg', 'sc 40kg', 't', 'kg', '@'] as const;

/** "R$ 1.234,50 /sc 60kg" (sem unidade: "R$ 5,23"). */
export function formatQuoteValue(priceCents: number, unit: string | null): string {
    const reais = Math.floor(priceCents / 100)
        .toString()
        .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const cents = String(priceCents % 100).padStart(2, '0');
    return `R$ ${reais},${cents}${unit ? ` /${unit}` : ''}`;
}

/** Hoje no horário de Brasília, como data pura (meia-noite UTC). */
export function todayInBrazil(now: Date = new Date()): Date {
    const ymd = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(now);
    return new Date(`${ymd}T00:00:00.000Z`);
}
