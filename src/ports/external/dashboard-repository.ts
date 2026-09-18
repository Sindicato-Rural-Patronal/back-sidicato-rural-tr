// Consultas do Painel Geral que nenhum outro repositório cobre. Tudo é
// contagem: nada de carregar listas para somar no Node.

export type QuotePeriod = 'MORNING' | 'AFTERNOON';

export interface DashboardRepository {
    /**
     * Inscrições ativas (não excluídas) ainda sem confirmar, só em cursos não
     * excluídos que ainda não terminaram — `endTime >= from`, onde `from` é a
     * meia-noite de hoje em Brasília no mesmo formato das datas do curso
     * (hora "de parede" rotulada com Z).
     */
    countPendingConfirmation(coursesEndingFrom: Date): Promise<number>;
    /** Cursos PUBLIC/PRIVATE não excluídos que começam em [from, before). */
    countCoursesStarting(from: Date, before: Date): Promise<number>;
    /**
     * Último período lançado no dia [from, before) do histórico de cotações;
     * null = nada lançado. A tarde vence a manhã (é o lançamento mais recente).
     */
    lastQuotePeriodOfDay(from: Date, before: Date): Promise<QuotePeriod | null>;
}
