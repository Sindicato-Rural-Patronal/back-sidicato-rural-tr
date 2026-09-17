import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cpfForStorage, createUserDataAdapter } from '../user-data.js';

const prisma = {
    userData: {
        create: vi.fn(),
        update: vi.fn(),
    },
};

const adapter = createUserDataAdapter(prisma as never);

describe('cpfForStorage', () => {
    it('grava só os dígitos', () => {
        expect(cpfForStorage('111.444.777-35')).toBe('11144477735');
        expect(cpfForStorage('11144477735')).toBe('11144477735');
    });

    it('vazio ou sem dígito vira null', () => {
        expect(cpfForStorage('')).toBeNull();
        expect(cpfForStorage(' .- ')).toBeNull();
        expect(cpfForStorage(null)).toBeNull();
    });
});

describe('UserDataAdapter — CPF normalizado na escrita', () => {
    beforeEach(() => vi.clearAllMocks());

    it('create com CPF mascarado grava só dígitos', async () => {
        await adapter.create({ name: 'JOAO',
email: 'j@x.com',
phone: '44999990001',
cpf: '111.444.777-35' });
        expect(prisma.userData.create).toHaveBeenCalledWith({
            data: { name: 'JOAO',
email: 'j@x.com',
phone: '44999990001',
cpf: '11144477735' },
        });
    });

    it('update com CPF mascarado grava só dígitos', async () => {
        await adapter.update('u1', { cpf: '111.444.777-35',
name: 'JOAO' });
        expect(prisma.userData.update).toHaveBeenCalledWith({
            where: { id: 'u1' },
            data: { cpf: '11144477735',
name: 'JOAO' },
        });
    });

    it('update que limpa o CPF grava null', async () => {
        await adapter.update('u1', { cpf: '' });
        expect(prisma.userData.update).toHaveBeenCalledWith({ where: { id: 'u1' },
data: { cpf: null } });
    });

    it('update sem CPF não mexe no campo', async () => {
        await adapter.update('u1', { name: 'MARIA' });
        expect(prisma.userData.update).toHaveBeenCalledWith({ where: { id: 'u1' },
data: { name: 'MARIA' } });
    });
});
