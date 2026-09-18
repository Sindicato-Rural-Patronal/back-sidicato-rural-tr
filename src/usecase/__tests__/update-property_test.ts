import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UpdatePropertyUseCase } from '../update-property.js';
import type { PropertyRepository } from '../../ports/external/property-repository.js';
import type { AddressRepository } from '../../ports/external/address-repository.js';

const mockPropertyRepo = {
    create: vi.fn(),
    update: vi.fn(),
    findByUserDataId: vi.fn(),
    countByUserDataId: vi.fn(),
    findById: vi.fn(),
    delete: vi.fn(),
} as unknown as PropertyRepository;

const mockAddressRepo = {
    create: vi.fn(),
    update: vi.fn(),
    findById: vi.fn(),
    findByCep: vi.fn(),
    delete: vi.fn(),
} as unknown as AddressRepository;

const personProperty = {
    id: 'prop-001',
    userDataId: 'user-001',
    companyId: null,
    name: 'FAZENDA SAO JOAO',
    registration: 'MAT-123',
    addressId: 'addr-001',
};

const makeUseCase = () => new UpdatePropertyUseCase(mockPropertyRepo, mockAddressRepo);

describe('UpdatePropertyUseCase', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(mockPropertyRepo.update).mockResolvedValue({ ...personProperty,
address: null } as any);
    });

    it('propriedade inexistente responde não encontrada', async () => {
        vi.mocked(mockPropertyRepo.findById).mockResolvedValue(null);
        const r = await makeUseCase().execute('sumiu', { userDataId: 'user-001' }, { name: 'X' });
        expect(r.error?.name).toBe('PropertyNotFoundError');
        expect(mockPropertyRepo.update).not.toHaveBeenCalled();
    });

    it('propriedade de outra pessoa responde não encontrada', async () => {
        vi.mocked(mockPropertyRepo.findById).mockResolvedValue(personProperty as any);
        const r = await makeUseCase().execute('prop-001', { userDataId: 'outra' }, { name: 'X' });
        expect(r.error?.name).toBe('PropertyNotFoundError');
        expect(mockPropertyRepo.update).not.toHaveBeenCalled();
    });

    it('propriedade da empresa não pode ser editada pela rota da pessoa', async () => {
        const companyProperty = { ...personProperty,
userDataId: null,
companyId: 'comp-001' };
        vi.mocked(mockPropertyRepo.findById).mockResolvedValue(companyProperty as any);
        const byPerson = await makeUseCase().execute('prop-001', { userDataId: 'user-001' }, { name: 'X' });
        expect(byPerson.error?.name).toBe('PropertyNotFoundError');

        const byCompany = await makeUseCase().execute('prop-001', { companyId: 'comp-001' }, { name: 'X' });
        expect(byCompany.error).toBeUndefined();
    });

    it('nome vazio é recusado', async () => {
        vi.mocked(mockPropertyRepo.findById).mockResolvedValue(personProperty as any);
        const r = await makeUseCase().execute('prop-001', { userDataId: 'user-001' }, { name: '   ' });
        expect(r.error?.message).toBe('Informe o nome da propriedade/endereço');
        expect(mockPropertyRepo.update).not.toHaveBeenCalled();
    });

    it('só o que veio é alterado (corpo vazio não quebra)', async () => {
        vi.mocked(mockPropertyRepo.findById).mockResolvedValue(personProperty as any);
        const r = await makeUseCase().execute('prop-001', { userDataId: 'user-001' }, {});
        expect(r.error).toBeUndefined();
        expect(mockAddressRepo.update).not.toHaveBeenCalled();
        expect(mockAddressRepo.create).not.toHaveBeenCalled();
        expect(mockPropertyRepo.update).toHaveBeenCalledWith('prop-001', {
            name: undefined,
            registration: undefined,
            addressId: undefined,
        });
    });

    it('edita o endereço que já existe, sem criar outro', async () => {
        vi.mocked(mockPropertyRepo.findById).mockResolvedValue(personProperty as any);
        await makeUseCase().execute(
            'prop-001',
            { userDataId: 'user-001' },
            { name: 'FAZENDA SANTA RITA',
address: { city: 'TERRA ROXA',
number: '' } },
        );
        expect(mockAddressRepo.create).not.toHaveBeenCalled();
        // Campo vazio vira null: limpa o que estava gravado.
        expect(mockAddressRepo.update).toHaveBeenCalledWith('addr-001', { city: 'TERRA ROXA',
number: null });
        expect(mockPropertyRepo.update).toHaveBeenCalledWith(
            'prop-001',
            expect.objectContaining({ name: 'FAZENDA SANTA RITA' }),
        );
    });

    it('propriedade sem endereço ganha um novo (sem os campos vazios)', async () => {
        vi.mocked(mockPropertyRepo.findById).mockResolvedValue({ ...personProperty,
addressId: null } as any);
        vi.mocked(mockAddressRepo.create).mockResolvedValue({ id: 'addr-nova' } as any);
        await makeUseCase().execute(
            'prop-001',
            { userDataId: 'user-001' },
            { address: { type: 'RURAL',
road: 'PR-182',
km: '12',
city: '' } },
        );
        expect(mockAddressRepo.create).toHaveBeenCalledWith({ type: 'RURAL',
road: 'PR-182',
km: '12' });
        expect(mockPropertyRepo.update).toHaveBeenCalledWith(
            'prop-001',
            expect.objectContaining({ addressId: 'addr-nova' }),
        );
    });

    it('matrícula vazia limpa o campo', async () => {
        vi.mocked(mockPropertyRepo.findById).mockResolvedValue(personProperty as any);
        await makeUseCase().execute('prop-001', { userDataId: 'user-001' }, { registration: '' });
        expect(mockPropertyRepo.update).toHaveBeenCalledWith(
            'prop-001',
            expect.objectContaining({ registration: null }),
        );
    });

    it('devolve a propriedade atualizada', async () => {
        vi.mocked(mockPropertyRepo.findById).mockResolvedValue(personProperty as any);
        vi.mocked(mockPropertyRepo.update).mockResolvedValue({
            ...personProperty,
            name: 'NOVO NOME',
            address: { id: 'addr-001' },
        } as any);
        const r = await makeUseCase().execute('prop-001', { userDataId: 'user-001' }, { name: 'NOVO NOME' });
        expect(r.property?.name).toBe('NOVO NOME');
        expect(r.property?.address?.id).toBe('addr-001');
    });
});
