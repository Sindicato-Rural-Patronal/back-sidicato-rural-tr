import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MAX_PREFS_BYTES, UpdateAdminPreferencesUseCase } from '../admin-preferences.js';
import type { UserAdminRepository } from '../../ports/external/user-admin-repository.js';
import { ValidationError } from '../../errors/validation.js';
import { AdminNotFoundError } from '../../errors/not-found.js';

const repo = {
    findById: vi.fn(),
    updateDashboardPrefs: vi.fn(),
} as unknown as UserAdminRepository;

const useCase = () => new UpdateAdminPreferencesUseCase(repo);

describe('UpdateAdminPreferencesUseCase', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(repo.findById).mockResolvedValue({ id: 'admin-1' } as never);
        vi.mocked(repo.updateDashboardPrefs).mockResolvedValue(undefined);
    });

    it('grava o objeto e devolve o que foi gravado', async () => {
        const prefs = { hiddenCards: ['quotes'],
calendarRoomId: null };
        const result = await useCase().execute('admin-1', { dashboardPrefs: prefs });
        expect(result.error).toBeUndefined();
        expect(result.dashboardPrefs).toEqual(prefs);
        expect(repo.updateDashboardPrefs).toHaveBeenCalledWith('admin-1', prefs);
    });

    it('aceita objeto vazio (voltar ao padrão)', async () => {
        const result = await useCase().execute('admin-1', { dashboardPrefs: {} });
        expect(result.error).toBeUndefined();
        expect(repo.updateDashboardPrefs).toHaveBeenCalledWith('admin-1', {});
    });

    it.each([
        ['sem o campo', {}],
        ['null', { dashboardPrefs: null }],
        ['array', { dashboardPrefs: [1, 2] }],
        ['texto', { dashboardPrefs: 'abc' }],
        ['número', { dashboardPrefs: 3 }],
        ['corpo que não é objeto', 'nada'],
    ])('recusa %s', async (_label, body) => {
        const result = await useCase().execute('admin-1', body);
        expect(result.error).toBeInstanceOf(ValidationError);
        expect(repo.updateDashboardPrefs).not.toHaveBeenCalled();
    });

    it('recusa payload acima do limite', async () => {
        const big = { blob: 'x'.repeat(MAX_PREFS_BYTES + 1) };
        const result = await useCase().execute('admin-1', { dashboardPrefs: big });
        expect(result.error).toBeInstanceOf(ValidationError);
        expect(result.error?.message).toContain(String(MAX_PREFS_BYTES));
        expect(repo.updateDashboardPrefs).not.toHaveBeenCalled();
    });

    it('admin inexistente → não encontrado', async () => {
        vi.mocked(repo.findById).mockResolvedValue(null);
        const result = await useCase().execute('sumiu', { dashboardPrefs: { a: 1 } });
        expect(result.error).toBeInstanceOf(AdminNotFoundError);
        expect(repo.updateDashboardPrefs).not.toHaveBeenCalled();
    });
});
