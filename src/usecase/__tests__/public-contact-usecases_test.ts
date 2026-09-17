import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    ListPublicContactsUseCase,
    AddPublicContactUseCase,
    UpdatePublicContactUseCase,
    RemovePublicContactUseCase,
    ReorderPublicContactsUseCase,
} from '../public-contact-usecases.js';
import type { PublicContactRepository } from '../../ports/external/public-contact-repository.js';
import type { UserDataRepository } from '../../ports/external/user-data-repository.js';
import { ValidationError } from '../../errors/validation.js';
import { PublicContactNotFoundError, UserDataNotFoundError } from '../../errors/not-found.js';
import { PublicContactAlreadyExistsError } from '../../errors/conflict.js';

const repo = {
    list: vi.fn(),
    findById: vi.fn(),
    findByPerson: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    updateTitle: vi.fn(),
    delete: vi.fn(),
    reorder: vi.fn(),
} as unknown as PublicContactRepository;
const people = { findById: vi.fn() } as unknown as UserDataRepository;

const person = (id: string, name: string) => ({ id,
name,
email: `${id}@x`,
phone: '44999990000',
avatar: null });

describe('Contatos públicos', () => {
    beforeEach(() => vi.clearAllMocks());

    it('lista pública no formato antigo, com foto, na ordem do repositório', async () => {
        vi.mocked(repo.list).mockResolvedValue([
            { id: 'c1',
title: 'Presidente',
userData: person('u1', 'ZECA') },
            { id: 'c2',
title: null,
userData: person('u2', 'ANA') },
        ] as never);
        const r = await new ListPublicContactsUseCase(repo).listPublic();
        expect(r).toEqual([
            { publicTitle: 'Presidente',
userData: { name: 'ZECA',
email: 'u1@x',
phone: '44999990000',
avatar: null } },
            { publicTitle: null,
userData: { name: 'ANA',
email: 'u2@x',
phone: '44999990000',
avatar: null } },
        ]);
    });

    it('adiciona qualquer pessoa no fim da lista; cargo vazio vira null', async () => {
        vi.mocked(people.findById).mockResolvedValue({ id: 'u1' } as never);
        vi.mocked(repo.findByPerson).mockResolvedValue(null);
        vi.mocked(repo.count).mockResolvedValue(2);
        vi.mocked(repo.create).mockResolvedValue({ id: 'c3' } as never);
        const r = await new AddPublicContactUseCase(repo, people).execute({ userDataId: 'u1',
title: '  ' });
        expect(r.error).toBeUndefined();
        expect(repo.create).toHaveBeenCalledWith({ userDataId: 'u1',
title: null,
order: 2 });
    });

    it('recusa pessoa inexistente, repetida ou sem id', async () => {
        const uc = new AddPublicContactUseCase(repo, people);
        expect((await uc.execute({})).error).toBeInstanceOf(ValidationError);
        vi.mocked(people.findById).mockResolvedValue(null);
        expect((await uc.execute({ userDataId: 'x' })).error).toBeInstanceOf(UserDataNotFoundError);
        vi.mocked(people.findById).mockResolvedValue({ id: 'u1' } as never);
        vi.mocked(repo.findByPerson).mockResolvedValue({ id: 'c1' } as never);
        expect((await uc.execute({ userDataId: 'u1' })).error).toBeInstanceOf(PublicContactAlreadyExistsError);
        expect(repo.create).not.toHaveBeenCalled();
    });

    it('editar e remover contato inexistente é 404', async () => {
        vi.mocked(repo.findById).mockResolvedValue(null);
        expect((await new UpdatePublicContactUseCase(repo).execute('x', { title: 'A' })).error).toBeInstanceOf(
            PublicContactNotFoundError,
        );
        expect((await new RemovePublicContactUseCase(repo).execute('x')).error).toBeInstanceOf(PublicContactNotFoundError);
    });

    it('reordenar exige todos os contatos, sem repetir', async () => {
        vi.mocked(repo.list).mockResolvedValue([{ id: 'c1' }, { id: 'c2' }] as never);
        const uc = new ReorderPublicContactsUseCase(repo);
        expect((await uc.execute({ order: ['c1'] })).error).toBeInstanceOf(ValidationError);
        expect((await uc.execute({ order: ['c1', 'c1'] })).error).toBeInstanceOf(ValidationError);
        expect((await uc.execute({ order: ['c2', 'c1'] })).error).toBeUndefined();
        expect(repo.reorder).toHaveBeenCalledWith(['c2', 'c1']);
    });
});
