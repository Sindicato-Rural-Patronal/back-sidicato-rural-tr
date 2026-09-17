import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateContactMessageUseCase } from '../create-contact-message.js';
import type { ContactMessageRepository } from '../../ports/external/contact-message-repository.js';
import type { NotificationPublisher } from '../../ports/external/notification-repository.js';

const repo = { create: vi.fn() } as unknown as ContactMessageRepository;
const publisher = { publish: vi.fn() } as unknown as NotificationPublisher;

const input = { name: 'MARIA',
email: 'maria@x.com',
phone: null,
subject: 'Curso',
message: 'Oi' };
const created = { id: 'm1',
...input,
read: false,
createdAt: new Date('2026-09-17T12:00:00Z') };

describe('CreateContactMessageUseCase', () => {
    beforeEach(() => vi.clearAllMocks());

    it('grava a mensagem e publica a notificação para quem tem READ_CONTACT', async () => {
        vi.mocked(repo.create).mockResolvedValue(created as never);
        const result = await new CreateContactMessageUseCase(repo, publisher).execute(input);
        expect(result.message?.id).toBe('m1');
        expect(publisher.publish).toHaveBeenCalledWith({
            type: 'CONTACT_MESSAGE',
            permission: 'READ_CONTACT',
            title: 'Nova mensagem de MARIA',
            body: 'Curso',
            link: '/admin/mensagens',
            entityId: 'm1',
        });
    });

    it('sem assunto, o corpo da notificação é null', async () => {
        vi.mocked(repo.create).mockResolvedValue({ ...created,
subject: null } as never);
        await new CreateContactMessageUseCase(repo, publisher).execute({ ...input,
subject: null });
        expect(publisher.publish).toHaveBeenCalledWith(expect.objectContaining({ body: null }));
    });

    it('falha ao publicar não impede a mensagem', async () => {
        vi.mocked(repo.create).mockResolvedValue(created as never);
        vi.mocked(publisher.publish).mockRejectedValueOnce(new Error('banco fora'));
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const result = await new CreateContactMessageUseCase(repo, publisher).execute(input);
        expect(result.error).toBeUndefined();
        expect(result.message?.id).toBe('m1');
        spy.mockRestore();
    });

    it('dados inválidos não gravam nem publicam', async () => {
        const result = await new CreateContactMessageUseCase(repo, publisher).execute({ ...input,
email: 'x' });
        expect(result.error).toBeDefined();
        expect(repo.create).not.toHaveBeenCalled();
        expect(publisher.publish).not.toHaveBeenCalled();
    });
});
