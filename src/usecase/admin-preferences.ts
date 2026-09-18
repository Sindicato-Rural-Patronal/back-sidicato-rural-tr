import type { UserAdminRepository } from '../ports/external/user-admin-repository.js';
import { ValidationError } from '../errors/validation.js';
import { AdminNotFoundError } from '../errors/not-found.js';

// Preferências do Painel Geral, por administrador. O conteúdo é livre (o painel
// decide o que guarda: cartões escondidos, ordem, filtro do calendário…), o
// backend só garante que é um objeto pequeno. Cada admin só mexe nas próprias
// (o id vem do token) — não precisa de permissão de gestão.

/** Limite do JSON guardado, em bytes. */
export const MAX_PREFS_BYTES = 4096;

export type DashboardPrefs = Record<string, unknown>;

/** Objeto simples (nem null, nem array, nem outro tipo). */
function isPlainObject(value: unknown): value is DashboardPrefs {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export class UpdateAdminPreferencesUseCase {
    constructor(private readonly userAdminRepo: UserAdminRepository) {}

    async execute(
        adminId: string,
        input: unknown,
    ): Promise<{
 error?: Error;
dashboardPrefs?: DashboardPrefs
}> {
        if (!isPlainObject(input) || !('dashboardPrefs' in input)) {
            return { error: new ValidationError('Informe dashboardPrefs (objeto)') };
        }
        const prefs = input.dashboardPrefs;
        if (!isPlainObject(prefs)) {
            return { error: new ValidationError('dashboardPrefs precisa ser um objeto') };
        }
        let serialized: string;
        try {
            serialized = JSON.stringify(prefs);
        } catch {
            return { error: new ValidationError('dashboardPrefs inválido') };
        }
        if (Buffer.byteLength(serialized, 'utf8') > MAX_PREFS_BYTES) {
            return {
                error: new ValidationError(
                    `dashboardPrefs muito grande (máximo de ${MAX_PREFS_BYTES} bytes)`,
                ),
            };
        }

        const admin = await this.userAdminRepo.findById(adminId);
        if (!admin) return { error: new AdminNotFoundError() };

        await this.userAdminRepo.updateDashboardPrefs(adminId, prefs);
        return { dashboardPrefs: prefs };
    }
}
