export interface SiteSettingsRepository {
    /** Todas as configs como mapa key→value. */
    getAll(): Promise<Record<string, string>>;
    /** Cria/atualiza cada par informado. */
    upsertMany(entries: Record<string, string>): Promise<void>;
}
