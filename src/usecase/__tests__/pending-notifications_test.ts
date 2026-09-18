import { describe, it, expect } from 'vitest';
import { computePendingNotifications, formatNames } from '../pending-notifications.js';
import type {
    NamedCount,
    PendingCourse,
    PendingCourseFilter,
    PendingNotificationsRepository,
    RoomBookingsOverlap,
} from '../../ports/external/pending-notifications-repository.js';

// Repositório em memória que aplica os filtros como o adapter do Prisma faria.
class FakeRepo implements PendingNotificationsRepository {
    courses: PendingCourse[] = [];
    quoteDates: Date[] = [];
    galleries: string[] = [];
    partners: string[] = [];
    incomplete = 0;
    members: {
        name: string;
        validUntil: Date;
    }[] = [];
    bookings: {
        title: string;
        roomName: string;
        startTime: Date;
        endTime: Date;
        isDeleted?: boolean;
    }[] = [];
    calls: string[] = [];

    async listCourses(f: PendingCourseFilter): Promise<PendingCourse[]> {
        this.calls.push('listCourses');
        const inRange = (d: Date, from?: Date, before?: Date) =>
            (!from || d >= from) && (!before || d < before);
        return this.courses
            .filter(c => (f.statuses as string[]).includes(c.status))
            .filter(c => inRange(c.startTime, f.startFrom, f.startBefore))
            .filter(c => inRange(c.endTime, f.endFrom, f.endBefore))
            .filter(c => !f.onlyWithUnconfirmed || c.unconfirmedCount > 0)
            .sort((a, b) => a[f.orderBy].getTime() - b[f.orderBy].getTime())
            .slice(0, f.take);
    }

    async countQuoteHistory(from: Date, before: Date): Promise<number> {
        this.calls.push('countQuoteHistory');
        return this.quoteDates.filter(d => d >= from && d < before).length;
    }

    async galleriesWithoutPhoto(take: number): Promise<NamedCount> {
        this.calls.push('galleriesWithoutPhoto');
        return { total: this.galleries.length,
names: this.galleries.slice(0, take) };
    }

    async partnersWithoutLogo(take: number): Promise<NamedCount> {
        this.calls.push('partnersWithoutLogo');
        return { total: this.partners.length,
names: this.partners.slice(0, take) };
    }

    async countIncompleteRegistrations(): Promise<number> {
        this.calls.push('countIncompleteRegistrations');
        return this.incomplete;
    }

    async membershipsExpiring(from: Date, before: Date, take: number): Promise<NamedCount> {
        this.calls.push('membershipsExpiring');
        const rows = this.members
            .filter(m => m.validUntil >= from && m.validUntil < before)
            .sort((a, b) => a.validUntil.getTime() - b.validUntil.getTime());
        return { total: rows.length,
names: rows.slice(0, take).map(m => m.name) };
    }

    async roomBookingsOverlapping(from: Date, before: Date, take: number): Promise<RoomBookingsOverlap> {
        this.calls.push('roomBookingsOverlapping');
        const rows = this.bookings
            .filter(b => !b.isDeleted && b.startTime < before && b.endTime > from)
            .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
        return {
            total: rows.length,
            items: rows.slice(0, take).map(({ title, roomName, startTime }) => ({ title,
roomName,
startTime })),
        };
    }
}

// Hora "de parede" de Brasília gravada com Z.
function booking(title: string, roomName: string, start: string, end: string, isDeleted = false) {
    return { title,
roomName,
startTime: new Date(`${start}Z`),
endTime: new Date(`${end}Z`),
isDeleted };
}

let seq = 0;
function course(
    p: Partial<PendingCourse> & {
        start: string;
        end?: string;
    },
): PendingCourse {
    seq += 1;
    return {
        id: p.id ?? `c${seq}`,
        name: p.name ?? `Curso ${seq}`,
        status: p.status ?? 'PUBLIC',
        // Hora "de parede" de Brasília gravada com Z.
        startTime: new Date(`${p.start}Z`),
        endTime: new Date(`${p.end ?? p.start}Z`),
        unconfirmedCount: p.unconfirmedCount ?? 0,
    };
}

const ALL = ['READ_COURSE', 'READ_MARKET_QUOTE', 'READ_BANNER', 'READ_USER'];
// Quinta-feira, 17/09/2026, 12:00 em Brasília.
const THU_NOON = new Date('2026-09-17T15:00:00Z');

describe('computePendingNotifications — permissões', () => {
    it('sem permissões não consulta nada', async () => {
        const repo = new FakeRepo();
        repo.galleries = ['FAEP'];
        repo.incomplete = 5;
        expect(await computePendingNotifications(repo, [], THU_NOON)).toEqual([]);
        expect(repo.calls).toEqual([]);
    });

    it('só consulta o que a permissão permite', async () => {
        const repo = new FakeRepo();
        repo.galleries = ['FAEP'];
        repo.incomplete = 5;
        repo.courses = [course({ start: '2026-09-17T19:00:00',
unconfirmedCount: 2 })];
        const result = await computePendingNotifications(repo, ['READ_BANNER'], THU_NOON);
        expect(result.map(n => n.type)).toEqual(['GALLERY_WITHOUT_PHOTO']);
        expect(repo.calls).toEqual(['galleriesWithoutPhoto']);
    });

    it('READ_USER traz parceiros, cadastros incompletos e associações', async () => {
        const repo = new FakeRepo();
        repo.partners = ['Coamo'];
        repo.incomplete = 4;
        repo.members = [{ name: 'Ana',
validUntil: new Date('2026-09-20T00:00:00Z') }];
        const result = await computePendingNotifications(repo, ['READ_USER'], THU_NOON);
        expect(result).toEqual([
            {
                type: 'MEMBERSHIP_EXPIRING',
                title: 'Associações vencendo em 30 dias',
                body: 'Ana',
                count: 1,
                link: '/admin/usuarios',
                severity: 'warning',
            },
            {
                type: 'PARTNER_WITHOUT_LOGO',
                title: 'Parceiros sem logo',
                body: 'Coamo',
                count: 1,
                link: '/admin/configuracoes?tab=parceiros',
                severity: 'info',
            },
            {
                type: 'INCOMPLETE_REGISTRATIONS',
                title: 'Cadastros incompletos',
                body: null,
                count: 4,
                link: '/admin/usuarios?incomplete=true',
                severity: 'info',
            },
        ]);
    });

    it('omite avisos com contagem zero', async () => {
        const repo = new FakeRepo();
        repo.quoteDates = [new Date('2026-09-17T00:00:00Z')];
        expect(await computePendingNotifications(repo, ALL, THU_NOON)).toEqual([]);
    });
});

describe('computePendingNotifications — cursos', () => {
    it('curso de hoje: com inscrição pendente é warning, sem pendência é info', async () => {
        const repo = new FakeRepo();
        repo.courses = [
            course({ id: 'a',
name: 'Soja',
start: '2026-09-17T08:00:00',
unconfirmedCount: 0 }),
            course({ id: 'b',
name: 'Milho',
start: '2026-09-17T19:00:00',
unconfirmedCount: 1 }),
            course({ id: 'c',
name: 'Trigo',
start: '2026-09-17T20:00:00',
unconfirmedCount: 3 }),
        ];
        const result = await computePendingNotifications(repo, ['READ_COURSE'], THU_NOON);
        expect(result).toEqual([
            {
                type: 'COURSE_STARTS_TODAY',
                title: 'Curso começa hoje: Milho',
                body: '1 inscrição sem confirmar',
                count: 1,
                link: '/admin/cursos?curso=b&aba=inscricoes',
                severity: 'warning',
            },
            {
                type: 'COURSE_STARTS_TODAY',
                title: 'Curso começa hoje: Trigo',
                body: '3 inscrições sem confirmar',
                count: 3,
                link: '/admin/cursos?curso=c&aba=inscricoes',
                severity: 'warning',
            },
            {
                type: 'COURSE_STARTS_TODAY',
                title: 'Curso começa hoje: Soja',
                body: null,
                count: 0,
                link: '/admin/cursos?curso=a&aba=inscricoes',
                severity: 'info',
            },
        ]);
    });

    it('usa o dia de Brasília: 23:30 de 17/09 (02:30Z do dia 18) ainda é dia 17', async () => {
        const repo = new FakeRepo();
        repo.courses = [
            course({ name: 'Hoje',
start: '2026-09-17T19:00:00' }),
            course({ name: 'Amanhã',
start: '2026-09-18T08:00:00',
unconfirmedCount: 2 }),
        ];
        const result = await computePendingNotifications(
            repo,
            ['READ_COURSE'],
            new Date('2026-09-18T02:30:00Z'),
        );
        expect(result.map(n => [n.type, n.title, n.body])).toEqual([
            ['COURSE_STARTS_TODAY', 'Curso começa hoje: Hoje', null],
            ['REGISTRATIONS_UNCONFIRMED', 'Inscrições aguardando confirmação', 'Amanhã'],
        ]);
    });

    it('à 00:30 de 18/09 em Brasília (03:30Z) o curso do dia 17 já não é de hoje', async () => {
        const repo = new FakeRepo();
        repo.courses = [
            course({ name: 'Ontem',
start: '2026-09-17T19:00:00',
end: '2026-09-17T22:00:00' }),
        ];
        const result = await computePendingNotifications(
            repo,
            ['READ_COURSE'],
            new Date('2026-09-18T03:30:00Z'),
        );
        expect(result.map(n => [n.type, n.body])).toEqual([
            ['COURSE_START_OVERDUE', 'Começou em 17/09'],
        ]);
    });

    it('curso não iniciado: só PUBLIC/PRIVATE e terminado há no máximo 30 dias', async () => {
        const repo = new FakeRepo();
        repo.courses = [
            course({
                id: 'ok',
                name: 'Recente',
                start: '2026-09-15T08:00:00',
                end: '2026-09-15T17:00:00',
            }),
            course({ name: 'Limite',
start: '2026-08-10T08:00:00',
end: '2026-08-18T17:00:00' }),
            course({ name: 'Antigo',
start: '2026-08-10T08:00:00',
end: '2026-08-17T17:00:00' }),
            course({ name: 'Rascunho',
status: 'UNPUBLISHED',
start: '2026-09-15T08:00:00' }),
            course({ name: 'Concluído',
status: 'COMPLETED',
start: '2026-09-15T08:00:00' }),
        ];
        const result = await computePendingNotifications(repo, ['READ_COURSE'], THU_NOON);
        expect(result.map(n => n.title)).toEqual([
            'Curso não iniciado no sistema: Limite',
            'Curso não iniciado no sistema: Recente',
        ]);
        expect(result[1]).toEqual({
            type: 'COURSE_START_OVERDUE',
            title: 'Curso não iniciado no sistema: Recente',
            body: 'Começou em 15/09',
            count: 1,
            link: '/admin/cursos?curso=ok&aba=inscricoes',
            severity: 'warning',
        });
    });

    it('curso em andamento que terminou antes de hoje pede presença e conclusão', async () => {
        const repo = new FakeRepo();
        repo.courses = [
            course({
                name: 'Ontem',
                status: 'IN_PROGRESS',
                start: '2026-09-14T08:00:00',
                end: '2026-09-16T17:00:00',
            }),
            course({
                name: 'Hoje',
                status: 'IN_PROGRESS',
                start: '2026-09-14T08:00:00',
                end: '2026-09-17T23:00:00',
            }),
        ];
        const result = await computePendingNotifications(repo, ['READ_COURSE'], THU_NOON);
        expect(result).toEqual([
            expect.objectContaining({
                type: 'COURSE_END_NOT_COMPLETED',
                title: 'Curso terminou: marque a presença e conclua — Ontem',
                body: 'Terminou em 16/09',
                severity: 'warning',
            }),
        ]);
    });

    it('agrega as inscrições sem confirmar dos próximos 7 dias ("e mais N")', async () => {
        const repo = new FakeRepo();
        repo.courses = [
            course({ name: 'A',
start: '2026-09-18T08:00:00',
unconfirmedCount: 1 }),
            course({ name: 'B',
start: '2026-09-19T08:00:00',
unconfirmedCount: 2 }),
            course({ name: 'Sem pendência',
start: '2026-09-19T09:00:00',
unconfirmedCount: 0 }),
            course({ name: 'C',
start: '2026-09-20T08:00:00',
unconfirmedCount: 3 }),
            course({
                name: 'D',
                status: 'PRIVATE',
                start: '2026-09-22T08:00:00',
                unconfirmedCount: 4,
            }),
            course({ name: 'E',
start: '2026-09-24T23:00:00',
unconfirmedCount: 5 }),
            course({ name: 'Fora da janela',
start: '2026-09-25T08:00:00',
unconfirmedCount: 9 }),
            course({
                name: 'Em andamento',
                status: 'IN_PROGRESS',
                start: '2026-09-20T08:00:00',
                unconfirmedCount: 9,
            }),
        ];
        const result = await computePendingNotifications(repo, ['READ_COURSE'], THU_NOON);
        expect(result).toEqual([
            {
                type: 'REGISTRATIONS_UNCONFIRMED',
                title: 'Inscrições aguardando confirmação',
                body: 'A, B, C e mais 2',
                count: 15,
                link: '/admin/cursos',
                severity: 'info',
            },
        ]);
    });

    it('limita a 10 itens por tipo, com os pendentes de hoje primeiro', async () => {
        const repo = new FakeRepo();
        const today = Array.from({ length: 12 }, (_, i) =>
            course({
                name: `Hoje ${i}`,
                start: `2026-09-17T${String(8 + i).padStart(2, '0')}:00:00`,
                // só os dois últimos do dia têm inscrição pendente
                unconfirmedCount: i >= 10 ? 1 : 0,
            }),
        );
        const overdue = Array.from({ length: 12 }, (_, i) =>
            course({
                name: `Atrasado ${i}`,
                start: `2026-09-${String(i + 1).padStart(2, '0')}T08:00:00`,
            }),
        );
        repo.courses = [...today, ...overdue];
        const result = await computePendingNotifications(repo, ['READ_COURSE'], THU_NOON);

        const todayItems = result.filter(n => n.type === 'COURSE_STARTS_TODAY');
        expect(todayItems).toHaveLength(10);
        expect(todayItems.slice(0, 2).map(n => n.title)).toEqual([
            'Curso começa hoje: Hoje 10',
            'Curso começa hoje: Hoje 11',
        ]);
        const overdueItems = result.filter(n => n.type === 'COURSE_START_OVERDUE');
        expect(overdueItems).toHaveLength(10);
        expect(overdueItems[0].title).toBe('Curso não iniciado no sistema: Atrasado 0');
    });
});

describe('computePendingNotifications — cotações', () => {
    it('cobra em dia útil a partir das 11:00 de Brasília sem lançamento no dia', async () => {
        const repo = new FakeRepo();
        repo.quoteDates = [new Date('2026-09-16T00:00:00Z')];
        const result = await computePendingNotifications(repo, ['READ_MARKET_QUOTE'], THU_NOON);
        expect(result).toEqual([
            {
                type: 'QUOTES_NOT_LAUNCHED',
                title: 'Cotações de hoje ainda não lançadas',
                body: null,
                count: 1,
                link: '/admin/cotacoes',
                severity: 'warning',
            },
        ]);
    });

    it('não cobra antes das 11:00 (10:59 BRT = 13:59Z)', async () => {
        const repo = new FakeRepo();
        expect(
            await computePendingNotifications(
                repo,
                ['READ_MARKET_QUOTE'],
                new Date('2026-09-17T13:59:00Z'),
            ),
        ).toEqual([]);
        expect(repo.calls).toEqual([]);
        expect(
            await computePendingNotifications(
                repo,
                ['READ_MARKET_QUOTE'],
                new Date('2026-09-17T14:00:00Z'),
            ),
        ).toHaveLength(1);
    });

    it('não cobra no fim de semana', async () => {
        const repo = new FakeRepo();
        const saturday = new Date('2026-09-19T15:00:00Z');
        const sunday = new Date('2026-09-20T15:00:00Z');
        expect(await computePendingNotifications(repo, ['READ_MARKET_QUOTE'], saturday)).toEqual(
            [],
        );
        expect(await computePendingNotifications(repo, ['READ_MARKET_QUOTE'], sunday)).toEqual([]);
        expect(repo.calls).toEqual([]);
    });

    it('lançamento de qualquer período do dia de Brasília resolve, inclusive às 23:30 BRT', async () => {
        const repo = new FakeRepo();
        // 23:30 de quinta (17/09) em Brasília = 02:30Z de sexta
        const lateThursday = new Date('2026-09-18T02:30:00Z');
        repo.quoteDates = [new Date('2026-09-17T00:00:00Z')];
        expect(
            await computePendingNotifications(repo, ['READ_MARKET_QUOTE'], lateThursday),
        ).toEqual([]);

        repo.quoteDates = [new Date('2026-09-18T00:00:00Z')];
        expect(
            await computePendingNotifications(repo, ['READ_MARKET_QUOTE'], lateThursday),
        ).toHaveLength(1);
    });
});

describe('computePendingNotifications — galerias, associações e ordem', () => {
    it('galerias sem foto citam até 3 nomes', async () => {
        const repo = new FakeRepo();
        repo.galleries = ['História', 'FAEP', 'Patrulha Rural', 'Eventos'];
        const [item] = await computePendingNotifications(repo, ['READ_BANNER'], THU_NOON);
        expect(item).toEqual({
            type: 'GALLERY_WITHOUT_PHOTO',
            title: 'Galerias ativas sem foto',
            body: 'História, FAEP, Patrulha Rural e mais 1',
            count: 4,
            link: '/admin/configuracoes?tab=galerias',
            severity: 'info',
        });
    });

    it('associações vencendo: de hoje até hoje + 30 dias, inclusive', async () => {
        const repo = new FakeRepo();
        repo.members = [
            { name: 'Venceu ontem',
validUntil: new Date('2026-09-16T00:00:00Z') },
            { name: 'Hoje',
validUntil: new Date('2026-09-17T00:00:00Z') },
            { name: 'Dia 30',
validUntil: new Date('2026-10-17T00:00:00Z') },
            { name: 'Dia 31',
validUntil: new Date('2026-10-18T00:00:00Z') },
        ];
        const result = await computePendingNotifications(repo, ['READ_USER'], THU_NOON);
        expect(result).toEqual([
            expect.objectContaining({
                type: 'MEMBERSHIP_EXPIRING',
                body: 'Hoje e Dia 30',
                count: 2,
            }),
        ]);
    });

    it('avisos (warning) vêm antes dos informativos', async () => {
        const repo = new FakeRepo();
        repo.galleries = ['FAEP'];
        repo.incomplete = 2;
        repo.members = [{ name: 'Ana',
validUntil: new Date('2026-09-25T00:00:00Z') }];
        repo.courses = [
            course({ name: 'Livre',
start: '2026-09-17T18:00:00' }),
            course({ name: 'Próximo',
start: '2026-09-18T08:00:00',
unconfirmedCount: 1 }),
            course({ name: 'Pendente',
start: '2026-09-17T19:00:00',
unconfirmedCount: 2 }),
        ];
        const result = await computePendingNotifications(repo, ALL, THU_NOON);
        expect(result.map(n => [n.severity, n.type])).toEqual([
            ['warning', 'COURSE_STARTS_TODAY'],
            ['warning', 'QUOTES_NOT_LAUNCHED'],
            ['warning', 'MEMBERSHIP_EXPIRING'],
            ['info', 'COURSE_STARTS_TODAY'],
            ['info', 'REGISTRATIONS_UNCONFIRMED'],
            ['info', 'GALLERY_WITHOUT_PHOTO'],
            ['info', 'INCOMPLETE_REGISTRATIONS'],
        ]);
    });
});

describe('computePendingNotifications — reservas de sala', () => {
    it('agrega as reservas de hoje com hora, título e sala ("e mais N")', async () => {
        const repo = new FakeRepo();
        repo.bookings = [
            booking('Reunião da diretoria', 'SALA 1', '2026-09-17T14:00:00', '2026-09-17T16:00:00'),
            booking('Palestra', 'AUDITORIO', '2026-09-17T08:00:00', '2026-09-17T10:00:00'),
            booking('Excluída', 'SALA 2', '2026-09-17T09:00:00', '2026-09-17T10:00:00', true),
            booking('Almoço', 'COZINHA', '2026-09-17T11:30:00', '2026-09-17T13:00:00'),
            booking('Noite', 'SALA APL', '2026-09-17T19:00:00', '2026-09-17T22:00:00'),
            booking('Amanhã', 'SALA 1', '2026-09-18T08:00:00', '2026-09-18T09:00:00'),
            booking('Ontem', 'SALA 1', '2026-09-16T08:00:00', '2026-09-16T23:59:00'),
        ];
        const result = await computePendingNotifications(repo, ['READ_COURSE'], THU_NOON);
        expect(result).toEqual([
            {
                type: 'ROOM_BOOKINGS_TODAY',
                title: 'Reservas de sala hoje',
                body: '08:00 Palestra (AUDITORIO), 11:30 Almoço (COZINHA), 14:00 Reunião da diretoria (SALA 1) e mais 1',
                count: 4,
                link: '/admin/agenda',
                severity: 'info',
            },
        ]);
    });

    it('conta a reserva que atravessa a meia-noite e usa o dia de Brasília', async () => {
        const repo = new FakeRepo();
        repo.bookings = [
            booking('Vigília', 'AUDITORIO', '2026-09-16T20:00:00', '2026-09-17T02:00:00'),
            booking('Termina à meia-noite', 'SALA 2', '2026-09-16T22:00:00', '2026-09-17T00:00:00'),
        ];
        // 23:30 de 17/09 em Brasília = 02:30Z do dia 18: ainda é dia 17.
        const result = await computePendingNotifications(
            repo,
            ['READ_COURSE'],
            new Date('2026-09-18T02:30:00Z'),
        );
        expect(result).toEqual([
            expect.objectContaining({ type: 'ROOM_BOOKINGS_TODAY',
body: '16/09 20:00 Vigília (AUDITORIO)',
count: 1 }),
        ]);
    });

    it('sem reservas hoje ou sem READ_COURSE não aparece', async () => {
        const repo = new FakeRepo();
        repo.bookings = [booking('Amanhã', 'SALA 1', '2026-09-18T08:00:00', '2026-09-18T09:00:00')];
        expect(await computePendingNotifications(repo, ['READ_COURSE'], THU_NOON)).toEqual([]);

        repo.bookings = [booking('Hoje', 'SALA 1', '2026-09-17T08:00:00', '2026-09-17T09:00:00')];
        repo.calls = [];
        expect(await computePendingNotifications(repo, ['READ_BANNER', 'READ_USER'], THU_NOON)).toEqual([]);
        expect(repo.calls).not.toContain('roomBookingsOverlapping');
    });
});

describe('formatNames', () => {
    it('monta a lista em português', () => {
        expect(formatNames([], 0)).toBeNull();
        expect(formatNames(['A'], 1)).toBe('A');
        expect(formatNames(['A', 'B'], 2)).toBe('A e B');
        expect(formatNames(['A', 'B', 'C'], 3)).toBe('A, B e C');
        expect(formatNames(['A', 'B', 'C', 'D'], 4)).toBe('A, B, C e mais 1');
        expect(formatNames(['A', 'B', 'C'], 10)).toBe('A, B, C e mais 7');
    });
});
