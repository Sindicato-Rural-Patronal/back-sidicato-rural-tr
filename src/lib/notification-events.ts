import type { NotificationEvent, NotificationPublisher } from '../ports/external/notification-repository.js';

// Eventos do sino do painel: tipo, permissão para ver, título e link montados
// num lugar só (o painel usa `type` para o ícone e `link` para abrir).

export function courseRegistrationEvent(input: {
    courseId: string;
    courseName: string;
    personName: string;
    registrationId: string;
}): NotificationEvent {
    return {
        type: 'COURSE_REGISTRATION',
        permission: 'READ_COURSE',
        title: `Nova inscrição em ${input.courseName}`,
        body: input.personName,
        link: `/admin/cursos?curso=${input.courseId}&aba=inscricoes`,
        entityId: input.registrationId,
    };
}

export function contactMessageEvent(input: {
    messageId: string;
    name: string;
    subject?: string | null;
}): NotificationEvent {
    return {
        type: 'CONTACT_MESSAGE',
        permission: 'READ_CONTACT',
        title: `Nova mensagem de ${input.name}`,
        body: input.subject?.trim() || null,
        link: '/admin/mensagens',
        entityId: input.messageId,
    };
}

export function inviteAcceptedEvent(input: {
 personName: string;
userDataId: string 
}): NotificationEvent {
    return {
        type: 'INVITE_ACCEPTED',
        permission: 'READ_USER_ADMIN',
        title: `${input.personName} ativou o acesso ao painel`,
        body: null,
        link: '/admin/usuarios?tab=admins',
        entityId: input.userDataId,
    };
}

/**
 * Publica sem nunca lançar: o adapter já trata os erros, mas o use case não
 * depende disso (outro publicador ou um mock podem falhar).
 */
export async function publishSafely(publisher: NotificationPublisher, event: NotificationEvent): Promise<void> {
    try {
        await publisher.publish(event);
    } catch (e) {
        console.error('[notifications] falha ao publicar', event.type, e);
    }
}
