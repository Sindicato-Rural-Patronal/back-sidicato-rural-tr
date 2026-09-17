import { z } from 'zod';
import { ValidationError } from '../errors/validation.js';
import type { ContactMessageRepository, ContactMessageModel } from '../ports/external/contact-message-repository.js';
import type { NotificationPublisher } from '../ports/external/notification-repository.js';
import { contactMessageEvent, publishSafely } from '../lib/notification-events.js';

const schema = z.object({
    name: z.string().min(1).max(100),
    email: z.string().email().max(150),
    phone: z.string().max(50).optional().nullable(),
    subject: z.string().max(50).optional().nullable(),
    message: z.string().min(1).max(2000),
});

type Request = z.infer<typeof schema>;

type Response = {
    error?: Error;
    message?: Pick<ContactMessageModel, 'id' | 'createdAt'>;
};

export class CreateContactMessageUseCase {
    constructor(
        private readonly repo: ContactMessageRepository,
        private readonly notifications: NotificationPublisher,
    ) {}

    async execute(input: Request): Promise<Response> {
        const parsed = schema.safeParse(input);
        if (!parsed.success) {
            return { error: new ValidationError(parsed.error.issues[0].message) };
        }

        const msg = await this.repo.create(parsed.data);
        await publishSafely(this.notifications, contactMessageEvent({
            messageId: msg.id,
            name: msg.name,
            subject: msg.subject,
        }));
        return { message: { id: msg.id,
createdAt: msg.createdAt } };
    }
}
