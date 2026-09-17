import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    CreateCompanyUseCase,
    UpdateCompanyUseCase,
    DeleteCompanyUseCase,
    AddCompanyMemberUseCase,
    UpdateCompanyMemberUseCase,
    RemoveCompanyMemberUseCase,
    AddCompanyPropertyUseCase,
    RemoveCompanyPropertyUseCase,
    ReorderPartnersUseCase,
    ListCompaniesUseCase,
} from '../company-usecases.js';
import type { CompanyRepository } from '../../ports/external/company-repository.js';
import type { UserDataRepository } from '../../ports/external/user-data-repository.js';
import type { PropertyRepository } from '../../ports/external/property-repository.js';
import type { AddressRepository } from '../../ports/external/address-repository.js';
import { ValidationError } from '../../errors/validation.js';
import {
    CompanyNotFoundError,
    CompanyMemberNotFoundError,
    PropertyNotFoundError,
    UserDataNotFoundError,
} from '../../errors/not-found.js';
import { CompanyCnpjAlreadyExistsError, CompanyMemberAlreadyExistsError } from '../../errors/conflict.js';

const repo = {
    findAll: vi.fn(),
count: vi.fn(),
findById: vi.fn(),
findDetail: vi.fn(),
findByCnpj: vi.fn(),
    create: vi.fn(),
update: vi.fn(),
softDelete: vi.fn(),
    findMember: vi.fn(),
findMemberByPerson: vi.fn(),
addMember: vi.fn(),
updateMemberTitle: vi.fn(),
removeMember: vi.fn(),
    listTitles: vi.fn(),
findPartners: vi.fn(),
reorderPartners: vi.fn(),
} as unknown as CompanyRepository;
const people = { findById: vi.fn() } as unknown as UserDataRepository;
const properties = { create: vi.fn(),
findById: vi.fn(),
delete: vi.fn() } as unknown as PropertyRepository;
const addresses = { create: vi.fn(),
update: vi.fn(),
delete: vi.fn() } as unknown as AddressRepository;

const company = { id: 'c1',
name: 'AGRO',
cnpj: '45723174000110',
isPartner: false,
primaryPropertyId: null } as never;

describe('CreateCompanyUseCase', () => {
    beforeEach(() => vi.clearAllMocks());

    it('guarda CNPJ só com dígitos, vazio vira null e registra quem criou', async () => {
        vi.mocked(repo.findByCnpj).mockResolvedValue(null);
        vi.mocked(repo.create).mockResolvedValue(company);
        const r = await new CreateCompanyUseCase(repo, addresses).execute(
            { name: '  AGRO  ',
cnpj: '45.723.174/0001-10',
phone: '(44) 3645-1111',
phone2: '',
email: '' },
            'admin-1',
        );
        expect(r.error).toBeUndefined();
        expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({
            name: 'AGRO',
cnpj: '45723174000110',
phone2: null,
email: null,
createdBy: 'admin-1',
        }));
    });

    it('ignora primaryPropertyId na criação (a empresa ainda não tem endereços)', async () => {
        vi.mocked(repo.create).mockResolvedValue(company);
        await new CreateCompanyUseCase(repo, addresses).execute({ name: 'AGRO',
primaryPropertyId: 'p1' });
        expect(repo.create).toHaveBeenCalledWith(expect.not.objectContaining({ primaryPropertyId: 'p1' }));
    });

    it.each([
        ['sem razão social', { name: '' }, 'razão social'],
        ['CNPJ inválido', { name: 'X',
cnpj: '11.111.111/1111-11' }, 'CNPJ inválido'],
        ['tipo desconhecido', { name: 'X',
type: 'MISTA' }, 'privada ou pública'],
        ['telefone curto', { name: 'X',
phone3: '3645' }, 'Telefone inválido'],
        ['e-mail inválido', { name: 'X',
email: 'nao-e-email' }, 'E-mail inválido'],
        ['site sem protocolo', { name: 'X',
website: 'saojoao.com.br' }, 'https://'],
    ])('rejeita %s', async (_n, input, trecho) => {
        const r = await new CreateCompanyUseCase(repo, addresses).execute(input);
        expect(r.error).toBeInstanceOf(ValidationError);
        expect(r.error?.message).toContain(trecho);
        expect(repo.create).not.toHaveBeenCalled();
    });

    it('rejeita CNPJ já usado por empresa ativa', async () => {
        vi.mocked(repo.findByCnpj).mockResolvedValue(company);
        const r = await new CreateCompanyUseCase(repo, addresses).execute({ name: 'OUTRA',
cnpj: '45723174000110' });
        expect(r.error).toBeInstanceOf(CompanyCnpjAlreadyExistsError);
    });
});

describe('Empresa: nome fantasia e endereço da sede', () => {
    beforeEach(() => vi.clearAllMocks());
    const withAddress = { ...(company as object),
addressId: 'a1',
properties: [],
members: [] } as never;
    const withoutAddress = { ...(company as object),
addressId: null,
properties: [],
members: [] } as never;

    it('cria com nome fantasia e endereço (CEP só dígitos, UF maiúscula)', async () => {
        vi.mocked(repo.findByCnpj).mockResolvedValue(null);
        vi.mocked(repo.create).mockResolvedValue(company);
        vi.mocked(addresses.create).mockResolvedValue({ id: 'a-new' } as never);
        const r = await new CreateCompanyUseCase(repo, addresses).execute({
            name: 'AGRO LTDA',
            tradeName: 'AGRO',
            address: { zipCode: '85990-000',
street: 'RUA PARANA',
number: '100',
neighborhood: 'CENTRO',
city: 'TERRA ROXA',
state: 'pr',
complement: '' },
        });
        expect(r.error).toBeUndefined();
        expect(addresses.create).toHaveBeenCalledWith({
            type: 'URBAN',
zipCode: '85990000',
street: 'RUA PARANA',
number: '100',
            neighborhood: 'CENTRO',
city: 'TERRA ROXA',
state: 'PR',
        });
        expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ tradeName: 'AGRO',
addressId: 'a-new' }));
        expect(repo.create).toHaveBeenCalledWith(expect.not.objectContaining({ address: expect.anything() }));
    });

    it('endereço todo vazio não cria endereço', async () => {
        vi.mocked(repo.create).mockResolvedValue(company);
        await new CreateCompanyUseCase(repo, addresses).execute({ name: 'AGRO',
address: { zipCode: '',
city: '  ' } });
        expect(addresses.create).not.toHaveBeenCalled();
        expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ addressId: null }));
    });

    it.each([
        ['CEP incompleto', { zipCode: '8599' }, 'CEP'],
        ['UF inválida', { state: 'Paraná' }, 'UF inválida'],
    ])('rejeita %s', async (_n, address, trecho) => {
        const r = await new CreateCompanyUseCase(repo, addresses).execute({ name: 'AGRO',
address });
        expect(r.error?.message).toContain(trecho);
    });

    it('atualiza o endereço existente, limpando os campos apagados', async () => {
        vi.mocked(repo.findDetail).mockResolvedValue(withAddress);
        vi.mocked(repo.update).mockResolvedValue(company);
        await new UpdateCompanyUseCase(repo, addresses).execute('c1', { address: { city: 'GUAIRA',
street: '' } });
        expect(addresses.update).toHaveBeenCalledWith('a1', expect.objectContaining({ city: 'GUAIRA',
street: null,
zipCode: null }));
        expect(addresses.create).not.toHaveBeenCalled();
    });

    it('cria endereço quando a empresa ainda não tinha', async () => {
        vi.mocked(repo.findDetail).mockResolvedValue(withoutAddress);
        vi.mocked(repo.update).mockResolvedValue(company);
        vi.mocked(addresses.create).mockResolvedValue({ id: 'a2' } as never);
        await new UpdateCompanyUseCase(repo, addresses).execute('c1', { address: { city: 'GUAIRA' } });
        expect(repo.update).toHaveBeenCalledWith('c1', expect.objectContaining({ addressId: 'a2' }));
    });

    it('endereço null remove o vínculo e apaga o endereço antigo', async () => {
        vi.mocked(repo.findDetail).mockResolvedValue(withAddress);
        vi.mocked(repo.update).mockResolvedValue(company);
        await new UpdateCompanyUseCase(repo, addresses).execute('c1', { address: null });
        expect(repo.update).toHaveBeenCalledWith('c1', expect.objectContaining({ addressId: null }));
        expect(addresses.delete).toHaveBeenCalledWith('a1');
    });

    it('sem o campo address não mexe no endereço', async () => {
        vi.mocked(repo.findDetail).mockResolvedValue(withAddress);
        vi.mocked(repo.update).mockResolvedValue(company);
        await new UpdateCompanyUseCase(repo, addresses).execute('c1', { tradeName: 'NOVO NOME' });
        expect(addresses.update).not.toHaveBeenCalled();
        expect(addresses.delete).not.toHaveBeenCalled();
        expect(repo.update).toHaveBeenCalledWith('c1', expect.not.objectContaining({ addressId: expect.anything() }));
    });
});

describe('UpdateCompanyUseCase', () => {
    beforeEach(() => vi.clearAllMocks());
    const detail = { ...(company as object),
properties: [{ id: 'p1' }],
members: [] } as never;

    it('404 quando não existe', async () => {
        vi.mocked(repo.findDetail).mockResolvedValue(null);
        expect((await new UpdateCompanyUseCase(repo, addresses).execute('x', { name: 'Y' })).error).toBeInstanceOf(CompanyNotFoundError);
    });

    it('mesmo CNPJ da própria empresa não é conflito', async () => {
        vi.mocked(repo.findDetail).mockResolvedValue(detail);
        vi.mocked(repo.update).mockResolvedValue(company);
        const r = await new UpdateCompanyUseCase(repo, addresses).execute('c1', { cnpj: '45.723.174/0001-10' });
        expect(r.error).toBeUndefined();
        expect(repo.findByCnpj).not.toHaveBeenCalled();
    });

    it('CNPJ de outra empresa é conflito', async () => {
        vi.mocked(repo.findDetail).mockResolvedValue(detail);
        vi.mocked(repo.findByCnpj).mockResolvedValue({ id: 'c2' } as never);
        const r = await new UpdateCompanyUseCase(repo, addresses).execute('c1', { cnpj: '11.222.333/0001-81' });
        expect(r.error).toBeInstanceOf(CompanyCnpjAlreadyExistsError);
    });

    it('propriedade principal precisa ser da empresa', async () => {
        vi.mocked(repo.findDetail).mockResolvedValue(detail);
        vi.mocked(repo.update).mockResolvedValue(company);
        const uc = new UpdateCompanyUseCase(repo, addresses);
        expect((await uc.execute('c1', { primaryPropertyId: 'de-outra-dona' })).error).toBeInstanceOf(ValidationError);
        expect((await uc.execute('c1', { primaryPropertyId: 'p1' })).error).toBeUndefined();
    });

    it('aceita partnerLogo null (remover logo) mas não uma URL', async () => {
        vi.mocked(repo.findDetail).mockResolvedValue(detail);
        vi.mocked(repo.update).mockResolvedValue(company);
        const uc = new UpdateCompanyUseCase(repo, addresses);
        expect((await uc.execute('c1', { partnerLogo: null })).error).toBeUndefined();
        expect((await uc.execute('c1', { partnerLogo: 'https://x/y.png' })).error).toBeInstanceOf(ValidationError);
    });
});

describe('DeleteCompanyUseCase', () => {
    beforeEach(() => vi.clearAllMocks());
    it('exclusão lógica', async () => {
        vi.mocked(repo.findById).mockResolvedValue(company);
        expect((await new DeleteCompanyUseCase(repo).execute('c1')).error).toBeUndefined();
        expect(repo.softDelete).toHaveBeenCalledWith('c1');
    });
});

describe('vínculos pessoa ↔ empresa', () => {
    beforeEach(() => vi.clearAllMocks());

    it('vincula com título em maiúsculas e sem acento (padrão do painel)', async () => {
        vi.mocked(repo.findById).mockResolvedValue(company);
        vi.mocked(people.findById).mockResolvedValue({ id: 'u1' } as never);
        vi.mocked(repo.findMemberByPerson).mockResolvedValue(null);
        vi.mocked(repo.addMember).mockResolvedValue({ id: 'm1' } as never);
        const r = await new AddCompanyMemberUseCase(repo, people).execute('c1', { userDataId: 'u1',
title: ' SÓCIO ' });
        expect(r.error).toBeUndefined();
        expect(repo.addMember).toHaveBeenCalledWith({ companyId: 'c1',
userDataId: 'u1',
title: 'SOCIO' });
    });

    it('exige título', async () => {
        const r = await new AddCompanyMemberUseCase(repo, people).execute('c1', { userDataId: 'u1',
title: '' });
        expect(r.error).toBeInstanceOf(ValidationError);
    });

    it('pessoa inexistente e vínculo repetido', async () => {
        vi.mocked(repo.findById).mockResolvedValue(company);
        vi.mocked(people.findById).mockResolvedValueOnce(null);
        const uc = new AddCompanyMemberUseCase(repo, people);
        expect((await uc.execute('c1', { userDataId: 'u1',
title: 'X' })).error).toBeInstanceOf(UserDataNotFoundError);

        vi.mocked(people.findById).mockResolvedValue({ id: 'u1' } as never);
        vi.mocked(repo.findMemberByPerson).mockResolvedValue({ id: 'm1' } as never);
        expect((await uc.execute('c1', { userDataId: 'u1',
title: 'X' })).error).toBeInstanceOf(CompanyMemberAlreadyExistsError);
    });

    it('não altera nem remove vínculo de outra empresa', async () => {
        vi.mocked(repo.findMember).mockResolvedValue({ id: 'm1',
companyId: 'outra' } as never);
        expect((await new UpdateCompanyMemberUseCase(repo).execute('c1', 'm1', { title: 'X' })).error)
            .toBeInstanceOf(CompanyMemberNotFoundError);
        expect((await new RemoveCompanyMemberUseCase(repo).execute('c1', 'm1')).error)
            .toBeInstanceOf(CompanyMemberNotFoundError);
        expect(repo.removeMember).not.toHaveBeenCalled();
    });
});

describe('endereços da empresa', () => {
    beforeEach(() => vi.clearAllMocks());

    it('primeiro endereço vira o principal', async () => {
        vi.mocked(repo.findById).mockResolvedValue(company);
        vi.mocked(addresses.create).mockResolvedValue({ id: 'a1' } as never);
        vi.mocked(properties.create).mockResolvedValue({ id: 'p1' } as never);
        const r = await new AddCompanyPropertyUseCase(repo, properties, addresses)
            .execute('c1', { name: 'Sede',
address: { city: 'TERRA ROXA' } });
        expect(r.error).toBeUndefined();
        expect(addresses.create).toHaveBeenCalledWith(expect.objectContaining({ type: 'URBAN' }));
        expect(properties.create).toHaveBeenCalledWith(expect.objectContaining({ companyId: 'c1',
addressId: 'a1' }));
        expect(repo.update).toHaveBeenCalledWith('c1', { primaryPropertyId: 'p1' });
    });

    it('não remove endereço de outra dona e limpa o principal ao remover', async () => {
        vi.mocked(repo.findById).mockResolvedValue({ ...(company as object),
primaryPropertyId: 'p1' } as never);
        const uc = new RemoveCompanyPropertyUseCase(repo, properties);

        vi.mocked(properties.findById).mockResolvedValueOnce({ id: 'px',
companyId: null,
userDataId: 'u1' } as never);
        expect((await uc.execute('c1', 'px')).error).toBeInstanceOf(PropertyNotFoundError);

        vi.mocked(properties.findById).mockResolvedValueOnce({ id: 'p1',
companyId: 'c1' } as never);
        expect((await uc.execute('c1', 'p1')).error).toBeUndefined();
        expect(repo.update).toHaveBeenCalledWith('c1', { primaryPropertyId: null });
    });
});

describe('parceiros', () => {
    beforeEach(() => vi.clearAllMocks());

    it('reordena só com todas as parceiras ativas, uma vez cada', async () => {
        vi.mocked(repo.findPartners).mockResolvedValue([{ id: 'c1' }, { id: 'c3' }] as never);
        const uc = new ReorderPartnersUseCase(repo);
        // não parceira, faltando uma e repetida
        expect((await uc.execute({ order: ['c1', 'c2'] })).error).toBeInstanceOf(ValidationError);
        expect((await uc.execute({ order: ['c1'] })).error).toBeInstanceOf(ValidationError);
        expect((await uc.execute({ order: ['c1', 'c1'] })).error).toBeInstanceOf(ValidationError);
        expect(repo.reorderPartners).not.toHaveBeenCalled();

        expect((await uc.execute({ order: ['c3', 'c1'] })).error).toBeUndefined();
        expect(repo.reorderPartners).toHaveBeenCalledWith(['c3', 'c1']);
    });
});

describe('ListCompaniesUseCase', () => {
    beforeEach(() => vi.clearAllMocks());
    it('converte filtros da query', async () => {
        vi.mocked(repo.findAll).mockResolvedValue([]);
        vi.mocked(repo.count).mockResolvedValue(0);
        await new ListCompaniesUseCase(repo).execute({ page: '2',
limit: '10',
isPartner: 'true',
type: 'PUBLIC',
search: ' agro ' });
        expect(repo.findAll).toHaveBeenCalledWith({ isPartner: true,
type: 'PUBLIC',
search: 'agro' }, 10, 10);
    });
});
