import { describe, it, expect } from 'vitest';
import { AUDIT_CHANGES_MAX, diffSnapshots, formatChanges, removedSnapshot, sanitizeSnapshot } from '../audit-diff.js';

describe('auditoria: campos gravados do registro', () => {
    it('tira segredos, binários, colunas de busca e datas de controle', () => {
        const clean = sanitizeSnapshot({
            id: 'x',
            name: 'JOÃO',
            passwordHash: '$2b$10$abc',
            token: 'segredo',
            data: new Uint8Array([1, 2, 3]),
            nameSearch: 'joao',
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null,
            isDeleted: false,
        });
        expect(clean).toEqual({ name: 'JOÃO' });
    });

    it('data vira ISO, lista vira texto, JSON vira texto e texto longo é cortado em 300', () => {
        const clean = sanitizeSnapshot({
            birthDate: new Date('1990-05-01T00:00:00.000Z'),
            cadPro: ['123', '456'],
            buttons: [{ label: 'Saiba mais',
url: '/sobre' }],
            description: 'a'.repeat(1000),
            price: 150.5,
            active: true,
            memberNotes: null,
        });
        expect(clean).toMatchObject({
            birthDate: '1990-05-01T00:00:00.000Z',
            cadPro: '123, 456',
            buttons: '[{"label":"Saiba mais","url":"/sobre"}]',
            price: 150.5,
            active: true,
            memberNotes: null,
        });
        expect((clean!.description as string).length).toBe(300);
        expect((clean!.description as string).endsWith('…')).toBe(true);
    });
});

describe('auditoria: o que mudou', () => {
    it('guarda só os campos alterados, com antes e depois', () => {
        const changes = diffSnapshots(
            { name: 'JOÃO',
email: 'joao@x.com',
phone: '44999990000',
updatedAt: new Date('2026-01-01') },
            { name: 'JOÃO',
email: null,
phone: '44988880000',
updatedAt: new Date('2026-09-17') },
        );
        expect(changes).toEqual([
            { field: 'email',
before: 'joao@x.com',
after: null },
            { field: 'phone',
before: '44999990000',
after: '44988880000' },
        ]);
    });

    it('datas iguais em objetos diferentes não contam como mudança', () => {
        expect(diffSnapshots(
            { startTime: new Date('2032-03-01T08:00:00Z') },
            { startTime: new Date('2032-03-01T08:00:00Z') },
        )).toBeNull();
    });

    it('senha trocada: registra que mudou, sem o hash', () => {
        const changes = diffSnapshots(
            { username: 'bali',
passwordHash: '$2b$10$antigo' },
            { username: 'bali2',
passwordHash: '$2b$10$novo' },
        );
        expect(changes).toEqual([
            { field: 'password',
before: null,
after: 'alterada' },
            { field: 'username',
before: 'bali',
after: 'bali2' },
        ]);
        expect(JSON.stringify(changes)).not.toContain('$2b$');
    });

    it('texto longo alterado depois dos 300 caracteres ainda aparece (cortado)', () => {
        const base = 'x'.repeat(400);
        const changes = diffSnapshots({ aboutText: `${base}a` }, { aboutText: `${base}b` });
        expect(changes).toHaveLength(1);
        expect((changes![0].before as string).length).toBe(300);
    });

    it('sem uma das leituras ou sem mudança → null', () => {
        expect(diffSnapshots(null, { name: 'A' })).toBeNull();
        expect(diffSnapshots({ name: 'A' }, null)).toBeNull();
        expect(diffSnapshots({ name: 'A' }, { name: 'A' })).toBeNull();
    });

    it('limita a quantidade de campos', () => {
        const before = Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`f${i}`, 1]));
        const after = Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`f${i}`, 2]));
        expect(diffSnapshots(before, after)).toHaveLength(AUDIT_CHANGES_MAX);
    });
});

describe('auditoria: registro excluído', () => {
    it('guarda os campos preenchidos como "antes" e nada depois; sem ids e sem segredos', () => {
        const changes = removedSnapshot({
            id: 'x',
            name: 'SALA 1',
            description: '',
            maxCapacity: 20,
            addressId: 'abc',
            passwordHash: 'hash',
            notes: null,
        });
        expect(changes).toEqual([
            { field: 'name',
before: 'SALA 1',
after: null },
            { field: 'maxCapacity',
before: 20,
after: null },
        ]);
    });

    it('registro não encontrado → null', () => {
        expect(removedSnapshot(null)).toBeNull();
    });
});

describe('auditoria: alterações na planilha', () => {
    it('"Campo: antes → depois; …" com nomes em português quando conhecidos', () => {
        expect(formatChanges([
            { field: 'email',
before: 'a@x.com',
after: null },
            { field: 'maxCapacity',
before: 10,
after: 20 },
        ])).toBe('E-mail: a@x.com → (vazio); maxCapacity: 10 → 20');
        expect(formatChanges(null)).toBe('');
        expect(formatChanges('lixo')).toBe('');
    });
});
