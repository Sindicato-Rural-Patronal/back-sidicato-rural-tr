// Agendamento de notícia. `publishAt` é hora "de parede" de Brasília rotulada
// em UTC (mesma convenção dos cursos e das reservas de sala), então comparar
// com "agora" pede o relógio de Brasília no mesmo formato.

import type { NewsListFilters, NewsStatus } from '../ports/external/news-repository.js';

// Brasília é UTC-3 fixo (sem horário de verão desde 2019).
const BRASILIA_OFFSET_MS = 3 * 60 * 60 * 1000;

/** "Agora" no mesmo formato dos horários gravados (relógio de Brasília com Z). */
export function nowWallClock(now: Date = new Date()): Date {
    return new Date(now.getTime() - BRASILIA_OFFSET_MS);
}

/** Agendada para depois: continua fora do site até o horário chegar. */
export function isScheduled(publishAt: Date | null | undefined, at: Date): boolean {
    return publishAt != null && publishAt.getTime() > at.getTime();
}

/** O que o site mostra: publicada e sem agendamento pendente. */
export function isNewsVisible(
    news: {
 status: NewsStatus;
publishAt: Date | null | undefined 
},
    at: Date,
): boolean {
    return news.status === 'PUBLISHED' && !isScheduled(news.publishAt, at);
}

/** Lista pública: só as que já estão no ar. */
export function publicNewsFilters(at: Date): NewsListFilters {
    return { status: 'PUBLISHED',
schedule: { at,
state: 'visible' } };
}

/** Valores aceitos no filtro do painel (qualquer outro = todas). */
export const ADMIN_NEWS_FILTERS = ['PUBLISHED', 'SCHEDULED', 'UNPUBLISHED'] as const;
export type AdminNewsFilter = (typeof ADMIN_NEWS_FILTERS)[number];

/**
 * Filtro do painel:
 * - PUBLISHED: já no ar; - SCHEDULED: publicada, mas agendada para depois;
 * - UNPUBLISHED: rascunho; - nada: todas.
 */
export function adminNewsFilters(
    status: string | undefined,
    search: string | undefined,
    at: Date,
): NewsListFilters {
    const trimmed = search?.trim();
    const base: NewsListFilters = trimmed ? { search: trimmed } : {};
    if (status === 'PUBLISHED') return { ...base,
...publicNewsFilters(at) };
    if (status === 'SCHEDULED') return { ...base,
status: 'PUBLISHED',
schedule: { at,
state: 'scheduled' } };
    if (status === 'UNPUBLISHED') return { ...base,
status: 'UNPUBLISHED' };
    return base;
}
