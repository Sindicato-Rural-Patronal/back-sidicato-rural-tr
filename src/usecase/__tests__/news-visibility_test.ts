import { describe, it, expect } from 'vitest';
import {
    adminNewsFilters,
    isNewsVisible,
    isScheduled,
    nowWallClock,
    publicNewsFilters,
} from '../news-visibility.js';

// `publishAt` é hora "de parede" de Brasília rotulada em UTC: 08:00 em Terra
// Roxa é gravado como "…T08:00:00.000Z" (mesma convenção dos cursos).
const at = (wall: string) => new Date(wall);

describe('agendamento de notícia', () => {
    describe('nowWallClock', () => {
        it('converte o instante real para o relógio de Brasília (UTC-3)', () => {
            // 11:00 UTC = 08:00 em Terra Roxa.
            expect(nowWallClock(new Date('2026-09-23T11:00:00.000Z')).toISOString()).toBe(
                '2026-09-23T08:00:00.000Z',
            );
        });
    });

    describe('isScheduled', () => {
        it('sem agendamento nunca está pendente', () => {
            expect(isScheduled(null, at('2026-09-23T08:00:00.000Z'))).toBe(false);
        });

        it('agendada para depois continua pendente', () => {
            expect(isScheduled(at('2026-09-23T09:00:00.000Z'), at('2026-09-23T08:59:59.000Z'))).toBe(true);
        });

        it('no minuto exato do agendamento já deixa de ser pendente', () => {
            expect(isScheduled(at('2026-09-23T09:00:00.000Z'), at('2026-09-23T09:00:00.000Z'))).toBe(false);
        });
    });

    describe('isNewsVisible (o que o site mostra às 08:00 de Brasília)', () => {
        const eightAm = at('2026-09-23T08:00:00.000Z');

        it('publicada sem agendamento aparece', () => {
            expect(isNewsVisible({ status: 'PUBLISHED',
publishAt: null }, eightAm)).toBe(true);
        });

        it('publicada e agendada para as 07:00 já apareceu', () => {
            expect(
                isNewsVisible({ status: 'PUBLISHED',
publishAt: at('2026-09-23T07:00:00.000Z') }, eightAm),
            ).toBe(true);
        });

        it('publicada e agendada para as 09:00 ainda não aparece', () => {
            expect(
                isNewsVisible({ status: 'PUBLISHED',
publishAt: at('2026-09-23T09:00:00.000Z') }, eightAm),
            ).toBe(false);
        });

        it('rascunho nunca aparece, mesmo com agendamento vencido', () => {
            expect(
                isNewsVisible({ status: 'UNPUBLISHED',
publishAt: at('2026-09-01T08:00:00.000Z') }, eightAm),
            ).toBe(false);
        });
    });

    describe('filtros da listagem', () => {
        const now = at('2026-09-23T08:00:00.000Z');

        it('lista pública: publicadas e já no ar', () => {
            expect(publicNewsFilters(now)).toEqual({
                status: 'PUBLISHED',
                schedule: { at: now,
state: 'visible' },
            });
        });

        it('painel sem filtro traz todas', () => {
            expect(adminNewsFilters(undefined, undefined, now)).toEqual({});
        });

        it('painel "Publicadas" = as que estão no ar', () => {
            expect(adminNewsFilters('PUBLISHED', undefined, now)).toEqual({
                status: 'PUBLISHED',
                schedule: { at: now,
state: 'visible' },
            });
        });

        it('painel "Agendadas" = publicadas com data futura', () => {
            expect(adminNewsFilters('SCHEDULED', undefined, now)).toEqual({
                status: 'PUBLISHED',
                schedule: { at: now,
state: 'scheduled' },
            });
        });

        it('painel "Não publicadas" = rascunhos', () => {
            expect(adminNewsFilters('UNPUBLISHED', undefined, now)).toEqual({ status: 'UNPUBLISHED' });
        });

        it('busca por título entra junto com o status e ignora espaços', () => {
            expect(adminNewsFilters('UNPUBLISHED', '  assembleia  ', now)).toEqual({
                search: 'assembleia',
                status: 'UNPUBLISHED',
            });
        });

        it('busca em branco não vira filtro', () => {
            expect(adminNewsFilters(undefined, '   ', now)).toEqual({});
        });

        it('valor desconhecido no filtro traz todas', () => {
            expect(adminNewsFilters('QUALQUER', undefined, now)).toEqual({});
        });
    });
});
