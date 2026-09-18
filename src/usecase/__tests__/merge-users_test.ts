import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListDuplicatePeopleUseCase, MergeUsersUseCase } from '../merge-users.js';
import type {
    MergeSide,
    UserMergeRepository,
} from '../../ports/external/user-merge-repository.js';
import { ValidationError } from '../../errors/validation.js';
import { UserDataNotFoundError } from '../../errors/not-found.js';
import { MergeBothHaveLoginError, MergeDifferentCpfError } from '../../errors/conflict.js';

const repo = {
    findDuplicateGroups: vi.fn(),
    findPeopleForCompare: vi.fn(),
    findForMerge: vi.fn(),
    merge: vi.fn(),
} as unknown as UserMergeRepository;

const NO_MOVES = {
    movedRegistrations: 0,
    movedCompanies: 0,
    movedProperties: 0,
    movedRelations: 0,
};

/** Cadastro mínimo; `over` troca só o que o teste precisa. */
function person(id: string, over: Partial<MergeSide> = {}): MergeSide {
    return {
        id,
        name: `PESSOA ${id}`,
        email: null,
        phone: '44999990000',
        cpf: null,
        avatar: null,
        nameSearch: null,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
        nickname: null,
        maritalStatus: null,
        phone2: null,
        phone3: null,
        rg: null,
        rgIssuer: null,
        rgIssuedAt: null,
        birthDate: null,
        driverLicense: null,
        driverLicenseCategory: null,
        birthPlace: null,
        nationality: null,
        gender: null,
        ethnicity: null,
        educationLevel: null,
        functionalCategory: null,
        specialNeeds: false,
        memberClassification: null,
        cadPro: [],
        familyIncome: null,
        memberType: null,
        boardPosition: null,
        boardMember: false,
        memberStatus: null,
        memberSince: null,
        membershipValidUntil: null,
        memberNotes: null,
        memberNotesNumber: null,
        primaryPropertyId: null,
        isDeleted: false,
        deletedAt: null,
        hasLogin: false,
        ...over,
    } as MergeSide;
}

/** `findForMerge` devolve cada cadastro pelo id. */
function sides(...people: MergeSide[]) {
    vi.mocked(repo.findForMerge).mockImplementation((id: string) =>
        Promise.resolve(people.find(p => p.id === id) ?? null),
    );
}

const useCase = new MergeUsersUseCase(repo);

describe('Juntar cadastros repetidos', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(repo.merge).mockResolvedValue(NO_MOVES);
    });

    it('junta e devolve o que foi movido', async () => {
        sides(person('keep'), person('remove'));
        vi.mocked(repo.merge).mockResolvedValue({
            movedRegistrations: 2,
            movedCompanies: 1,
            movedProperties: 3,
            movedRelations: 4,
        });

        const r = await useCase.execute({ keepId: 'keep',
removeId: 'remove' });

        expect(r.error).toBeUndefined();
        expect(r.result).toMatchObject({
            keepId: 'keep',
            removedId: 'remove',
            movedRegistrations: 2,
            movedCompanies: 1,
            movedProperties: 3,
            movedRelations: 4,
            filledFields: [],
        });
        expect(repo.merge).toHaveBeenCalledWith({ keepId: 'keep',
removeId: 'remove',
fill: {} });
    });

    it('preenche só os campos vazios do cadastro que fica', async () => {
        const birth = new Date('1980-05-04');
        sides(
            person('keep', { cpf: null,
rg: '123456',
email: null,
phone: '' }),
            person('remove', {
                cpf: '52998224725',
                rg: '999999',
                email: 'zeca@exemplo.com',
                phone: '44991112222',
                birthDate: birth,
                memberNotes: 'veio da inscrição',
            }),
        );

        const r = await useCase.execute({ keepId: 'keep',
removeId: 'remove' });

        const call = vi.mocked(repo.merge).mock.calls[0][0];
        expect(call.fill).toEqual({
            cpf: '52998224725',
            email: 'zeca@exemplo.com',
            phone: '44991112222',
            birthDate: birth,
            memberNotes: 'veio da inscrição',
        });
        // RG já preenchido não é sobrescrito.
        expect(call.fill.rg).toBeUndefined();
        expect(r.result?.filledFields).toEqual([
            'CPF',
            'E-mail',
            'Telefone',
            'Data de nascimento',
            'Observações',
        ]);
    });

    it('trata lista vazia e caixa desmarcada como campo vazio', async () => {
        sides(
            person('keep', { cadPro: [],
boardMember: false }),
            person('remove', { cadPro: ['123'],
boardMember: true }),
        );

        await useCase.execute({ keepId: 'keep',
removeId: 'remove' });

        expect(vi.mocked(repo.merge).mock.calls[0][0].fill).toEqual({
            cadPro: ['123'],
            boardMember: true,
        });
    });

    it('recusa juntar o cadastro com ele mesmo', async () => {
        const r = await useCase.execute({ keepId: 'x',
removeId: 'x' });
        expect(r.error).toBeInstanceOf(ValidationError);
        expect(repo.merge).not.toHaveBeenCalled();
    });

    it('recusa sem os dois cadastros', async () => {
        const r = await useCase.execute({ keepId: 'x' });
        expect(r.error).toBeInstanceOf(ValidationError);
        expect(repo.merge).not.toHaveBeenCalled();
    });

    it('404 quando um dos cadastros não existe', async () => {
        sides(person('keep'));
        const r = await useCase.execute({ keepId: 'keep',
removeId: 'sumiu' });
        expect(r.error).toBeInstanceOf(UserDataNotFoundError);
        expect(repo.merge).not.toHaveBeenCalled();
    });

    it('recusa cadastro já excluído', async () => {
        sides(person('keep'), person('remove', { isDeleted: true }));
        const r = await useCase.execute({ keepId: 'keep',
removeId: 'remove' });
        expect(r.error).toBeInstanceOf(ValidationError);
        expect(repo.merge).not.toHaveBeenCalled();
    });

    it('recusa quando os dois têm CPF e são diferentes', async () => {
        sides(
            person('keep', { cpf: '52998224725' }),
            person('remove', { cpf: '11144477735' }),
        );
        const r = await useCase.execute({ keepId: 'keep',
removeId: 'remove' });
        expect(r.error).toBeInstanceOf(MergeDifferentCpfError);
        expect(r.error?.message).toBe('Cadastros com CPFs diferentes não podem ser juntados.');
        expect(repo.merge).not.toHaveBeenCalled();
    });

    it('aceita o mesmo CPF gravado com e sem máscara', async () => {
        sides(
            person('keep', { cpf: '529.982.247-25' }),
            person('remove', { cpf: '52998224725' }),
        );
        const r = await useCase.execute({ keepId: 'keep',
removeId: 'remove' });
        expect(r.error).toBeUndefined();
    });

    it('recusa quando os dois têm acesso ao painel', async () => {
        sides(person('keep', { hasLogin: true }), person('remove', { hasLogin: true }));
        const r = await useCase.execute({ keepId: 'keep',
removeId: 'remove' });
        expect(r.error).toBeInstanceOf(MergeBothHaveLoginError);
        expect(repo.merge).not.toHaveBeenCalled();
    });

    it('aceita quando só um tem acesso ao painel', async () => {
        sides(person('keep'), person('remove', { hasLogin: true }));
        const r = await useCase.execute({ keepId: 'keep',
removeId: 'remove' });
        expect(r.error).toBeUndefined();
        expect(repo.merge).toHaveBeenCalled();
    });
});

describe('Possíveis duplicados', () => {
    beforeEach(() => vi.clearAllMocks());

    const group = (reason: 'NOME' | 'TELEFONE' | 'EMAIL', key: string, ids: string[]) => ({
        reason,
        key,
        people: ids.map(id => ({
            id,
            name: id,
            cpf: null,
            email: null,
            phone: '44999990000',
            createdAt: new Date(),
            hasLogin: false,
            counts: { registrations: 0,
companies: 0,
properties: 0,
relations: 0 },
        })),
    });

    it('não repete o mesmo par que casou por nome e por telefone', async () => {
        vi.mocked(repo.findDuplicateGroups).mockResolvedValue([
            group('NOME', 'joao silva', ['a', 'b']),
            group('TELEFONE', '44999990000', ['b', 'a']),
            group('EMAIL', 'x@y.com', ['a', 'c']),
        ]);

        const r = await new ListDuplicatePeopleUseCase(repo).execute({});

        expect(r.groups.map(g => g.reason)).toEqual(['NOME', 'EMAIL']);
    });

    it('limita o número de grupos entre 1 e 200 (padrão 50)', async () => {
        vi.mocked(repo.findDuplicateGroups).mockResolvedValue([]);
        const list = new ListDuplicatePeopleUseCase(repo);
        await list.execute({});
        await list.execute({ limit: 0 });
        await list.execute({ limit: 9999 });
        expect(vi.mocked(repo.findDuplicateGroups).mock.calls.map(c => c[0])).toEqual([50, 50, 200]);
    });
});
