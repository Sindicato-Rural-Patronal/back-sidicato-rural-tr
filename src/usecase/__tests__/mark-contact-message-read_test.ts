import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MarkContactMessageReadUseCase } from '../mark-contact-message-read.js';
import type { ContactMessageRepository } from '../../ports/external/contact-message-repository.js';
import { ContactMessageNotFoundError } from '../../errors/not-found.js';

const repo = {
    findById: vi.fn(),
    setRead: vi.fn(),
} as unknown as ContactMessageRepository;

const message = (read: boolean) => ({ id: 'm1',
name: 'MARIA',
email: 'maria@x.com',
phone: null,
subject: 'Curso',
message: 'Oi',
read,
createdAt: new Date() });

describe('MarkContactMessageReadUseCase', () => {
    beforeEach(() => vi.clearAllMocks());

    it('marca como lida por padrão', async () => {
        vi.mocked(repo.findById).mockResolvedValue(message(false) as never);
        expect(await new MarkContactMessageReadUseCase(repo).execute('m1')).toEqual({});
        expect(repo.setRead).toHaveBeenCalledWith('m1', true);
    });

    it('volta para não lida', async () => {
        vi.mocked(repo.findById).mockResolvedValue(message(true) as never);
        expect(await new MarkContactMessageReadUseCase(repo).execute('m1', false)).toEqual({});
        expect(repo.setRead).toHaveBeenCalledWith('m1', false);
    });

    it('já está no estado pedido: não grava de novo', async () => {
        vi.mocked(repo.findById).mockResolvedValue(message(true) as never);
        expect(await new MarkContactMessageReadUseCase(repo).execute('m1', true)).toEqual({});
        expect(repo.setRead).not.toHaveBeenCalled();
    });

    it('mensagem inexistente → 404', async () => {
        vi.mocked(repo.findById).mockResolvedValue(null);
        const r = await new MarkContactMessageReadUseCase(repo).execute('x', false);
        expect(r.error).toBeInstanceOf(ContactMessageNotFoundError);
        expect(repo.setRead).not.toHaveBeenCalled();
    });
});
