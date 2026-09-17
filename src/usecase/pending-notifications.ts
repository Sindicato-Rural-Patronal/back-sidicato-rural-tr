import type {
    NamedCount,
    PendingCourse,
    PendingNotificationsRepository,
} from '../ports/external/pending-notifications-repository.js';

// Pendências do painel (sino de notificações), calculadas na hora a partir dos
// dados — nada é gravado. Cada tipo só é consultado quando o admin tem a
// permissão de leitura correspondente.

export type PendingNotification = {
    type: string;
    title: string;
    body: string | null;
    count: number;
    link: string | null;
    severity: 'info' | 'warning';
};

const DAY_MS = 24 * 60 * 60 * 1000;
// Brasília é UTC-3 fixo (sem horário de verão desde 2019).
const BRASILIA_OFFSET_MS = 3 * 60 * 60 * 1000;

/** Máximo de itens por curso de cada tipo. */
const COURSE_ITEMS_LIMIT = 10;
/** Nomes citados no texto antes do "e mais N". */
const NAMES_IN_BODY = 3;
/** Cotações do dia passam a ser cobradas a partir desta hora (Brasília), de segunda a sexta. */
const QUOTES_DEADLINE_HOUR = 11;
/** Curso que não foi iniciado no sistema só é cobrado se terminou há no máximo estes dias. */
const OVERDUE_WINDOW_DAYS = 30;
/** Inscrições sem confirmar nos cursos dos próximos dias (hoje fica no aviso próprio). */
const UPCOMING_DAYS = 7;
const MEMBERSHIP_WINDOW_DAYS = 30;
// Folga na busca: os cursos de hoje são reordenados (com inscrição pendente primeiro)
// antes do limite; os próximos são somados no aviso agregado.
const TODAY_FETCH_CAP = 50;
const UPCOMING_FETCH_CAP = 100;

const OPEN_STATUSES = ['PUBLIC', 'PRIVATE'] as const;

/**
 * Relógio de Brasília: o dia de hoje como meia-noite com Z (mesmo formato das
 * datas "de parede" do curso e do referenceDate das cotações), dia da semana e hora.
 */
function brasiliaClock(now: Date) {
    const wall = new Date(now.getTime() - BRASILIA_OFFSET_MS);
    const today = new Date(Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate()));
    return {
        today,
        weekday: wall.getUTCDay(),
        hour: wall.getUTCHours(),
    };
}

const addDays = (date: Date, days: number) => new Date(date.getTime() + days * DAY_MS);

/** "DD/MM" de uma data gravada como hora de parede com Z. */
function dayMonth(date: Date): string {
    const iso = date.toISOString();
    return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

/** "A", "A e B", "A, B e C" ou "A, B, C e mais N". */
export function formatNames(names: string[], total: number): string | null {
    const shown = names.slice(0, NAMES_IN_BODY);
    if (shown.length === 0) return null;
    const rest = total - shown.length;
    if (rest > 0) return `${shown.join(', ')} e mais ${rest}`;
    if (shown.length === 1) return shown[0];
    return `${shown.slice(0, -1).join(', ')} e ${shown[shown.length - 1]}`;
}

function unconfirmedText(n: number): string {
    return n === 1 ? '1 inscrição sem confirmar' : `${n} inscrições sem confirmar`;
}

const courseLink = (id: string) => `/admin/cursos?curso=${id}&aba=inscricoes`;

async function coursePendings(
    repo: PendingNotificationsRepository,
    today: Date,
): Promise<PendingNotification[]> {
    const tomorrow = addDays(today, 1);
    const [startingToday, notStarted, endedInProgress, upcoming] = await Promise.all([
        repo.listCourses({
            statuses: [...OPEN_STATUSES],
            startFrom: today,
            startBefore: tomorrow,
            orderBy: 'startTime',
            take: TODAY_FETCH_CAP,
        }),
        repo.listCourses({
            statuses: [...OPEN_STATUSES],
            startBefore: today,
            endFrom: addDays(today, -OVERDUE_WINDOW_DAYS),
            orderBy: 'startTime',
            take: COURSE_ITEMS_LIMIT,
        }),
        repo.listCourses({
            statuses: ['IN_PROGRESS'],
            endBefore: today,
            orderBy: 'endTime',
            take: COURSE_ITEMS_LIMIT,
        }),
        repo.listCourses({
            statuses: [...OPEN_STATUSES],
            startFrom: tomorrow,
            startBefore: addDays(today, UPCOMING_DAYS + 1),
            onlyWithUnconfirmed: true,
            orderBy: 'startTime',
            take: UPCOMING_FETCH_CAP,
        }),
    ]);

    const items: PendingNotification[] = [];

    // Hoje: os que têm inscrição sem confirmar primeiro, depois pela hora de início.
    const byUrgency = [...startingToday].sort(
        (a, b) => Number(b.unconfirmedCount > 0) - Number(a.unconfirmedCount > 0),
    );
    for (const c of byUrgency.slice(0, COURSE_ITEMS_LIMIT)) {
        const n = c.unconfirmedCount;
        items.push({
            type: 'COURSE_STARTS_TODAY',
            title: `Curso começa hoje: ${c.name}`,
            body: n > 0 ? unconfirmedText(n) : null,
            count: n,
            link: courseLink(c.id),
            severity: n > 0 ? 'warning' : 'info',
        });
    }

    for (const c of notStarted.slice(0, COURSE_ITEMS_LIMIT)) {
        items.push({
            type: 'COURSE_START_OVERDUE',
            title: `Curso não iniciado no sistema: ${c.name}`,
            body: `Começou em ${dayMonth(c.startTime)}`,
            count: 1,
            link: courseLink(c.id),
            severity: 'warning',
        });
    }

    for (const c of endedInProgress.slice(0, COURSE_ITEMS_LIMIT)) {
        items.push({
            type: 'COURSE_END_NOT_COMPLETED',
            title: `Curso terminou: marque a presença e conclua — ${c.name}`,
            body: `Terminou em ${dayMonth(c.endTime)}`,
            count: 1,
            link: courseLink(c.id),
            severity: 'warning',
        });
    }

    const pendingUpcoming = upcoming.filter((c: PendingCourse) => c.unconfirmedCount > 0);
    const totalUnconfirmed = pendingUpcoming.reduce((sum, c) => sum + c.unconfirmedCount, 0);
    if (totalUnconfirmed > 0) {
        items.push({
            type: 'REGISTRATIONS_UNCONFIRMED',
            title: 'Inscrições aguardando confirmação',
            body: formatNames(
                pendingUpcoming.map(c => c.name),
                pendingUpcoming.length,
            ),
            count: totalUnconfirmed,
            link: '/admin/cursos',
            severity: 'info',
        });
    }

    return items;
}

async function quotePendings(
    repo: PendingNotificationsRepository,
    clock: ReturnType<typeof brasiliaClock>,
): Promise<PendingNotification[]> {
    const weekday = clock.weekday >= 1 && clock.weekday <= 5;
    if (!weekday || clock.hour < QUOTES_DEADLINE_HOUR) return [];
    const launched = await repo.countQuoteHistory(clock.today, addDays(clock.today, 1));
    if (launched > 0) return [];
    return [
        {
            type: 'QUOTES_NOT_LAUNCHED',
            title: 'Cotações de hoje ainda não lançadas',
            body: null,
            count: 1,
            link: '/admin/cotacoes',
            severity: 'warning',
        },
    ];
}

/** Aviso com total e nomes; omitido quando não há nada. */
function namedItem(
    result: NamedCount,
    base: Omit<PendingNotification, 'body' | 'count'>,
): PendingNotification[] {
    if (result.total <= 0) return [];
    return [{ ...base,
body: formatNames(result.names, result.total),
count: result.total }];
}

async function galleryPendings(
    repo: PendingNotificationsRepository,
): Promise<PendingNotification[]> {
    const galleries = await repo.galleriesWithoutPhoto(NAMES_IN_BODY);
    return namedItem(galleries, {
        type: 'GALLERY_WITHOUT_PHOTO',
        title: 'Galerias ativas sem foto',
        link: '/admin/configuracoes?tab=galerias',
        severity: 'info',
    });
}

async function userPendings(
    repo: PendingNotificationsRepository,
    today: Date,
): Promise<PendingNotification[]> {
    const [partners, incomplete, expiring] = await Promise.all([
        repo.partnersWithoutLogo(NAMES_IN_BODY),
        repo.countIncompleteRegistrations(),
        // Validade de hoje até hoje + 30 (inclusive).
        repo.membershipsExpiring(today, addDays(today, MEMBERSHIP_WINDOW_DAYS + 1), NAMES_IN_BODY),
    ]);

    const items: PendingNotification[] = [
        ...namedItem(partners, {
            type: 'PARTNER_WITHOUT_LOGO',
            title: 'Parceiros sem logo',
            link: '/admin/configuracoes?tab=parceiros',
            severity: 'info',
        }),
    ];
    if (incomplete > 0) {
        items.push({
            type: 'INCOMPLETE_REGISTRATIONS',
            title: 'Cadastros incompletos',
            body: null,
            count: incomplete,
            link: '/admin/usuarios?incomplete=true',
            severity: 'info',
        });
    }
    items.push(
        ...namedItem(expiring, {
            type: 'MEMBERSHIP_EXPIRING',
            title: 'Associações vencendo em 30 dias',
            link: '/admin/usuarios',
            severity: 'warning',
        }),
    );
    return items;
}

/**
 * Pendências visíveis para um admin, conforme as permissões dele.
 * Ordem: avisos (warning) primeiro, depois informativos; dentro de cada grupo,
 * cursos, cotações, galerias e cadastros.
 */
export async function computePendingNotifications(
    repo: PendingNotificationsRepository,
    permissions: string[],
    now: Date,
): Promise<PendingNotification[]> {
    const can = (permission: string) => permissions.includes(permission);
    const clock = brasiliaClock(now);
    const none = Promise.resolve<PendingNotification[]>([]);

    const groups = await Promise.all([
        can('READ_COURSE') ? coursePendings(repo, clock.today) : none,
        can('READ_MARKET_QUOTE') ? quotePendings(repo, clock) : none,
        can('READ_BANNER') ? galleryPendings(repo) : none,
        can('READ_USER') ? userPendings(repo, clock.today) : none,
    ]);

    const rank = (n: PendingNotification) => (n.severity === 'warning' ? 0 : 1);
    // sort é estável: mantém a ordem dos grupos dentro de cada severidade.
    return groups.flat().sort((a, b) => rank(a) - rank(b));
}
