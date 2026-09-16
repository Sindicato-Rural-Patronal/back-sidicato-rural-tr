import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    CreateConvenioUseCase,
    UpdateConvenioUseCase,
    DeleteConvenioUseCase,
    GetPublicConvenioUseCase,
} from '../convenio-usecases.js';
import type { ConvenioRepository } from '../../ports/external/convenio-repository.js';
import { ValidationError } from '../../errors/validation.js';
import { ConvenioNotFoundError } from '../../errors/not-found.js';
import { ConvenioSlugAlreadyExistsError } from '../../errors/conflict.js';

const repo = {
    listMenu: vi.fn(),
    findAll: vi.fn(),
    findById: vi.fn(),
    findBySlug: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
} as unknown as ConvenioRepository;

const validInput = {
    slug: 'unimed',
    name: 'Unimed',
    title: 'Tabela de valores / Unimed',
    priceRows: [{ label: '0 a 18 anos',
priceCents: 31713 }],
    documents: ['RG', 'CPF'],
};

const existing = { id: 'c1',
slug: 'unimed',
name: 'Unimed',
isActive: true } as never;

describe('CreateConvenioUseCase', () => {
    beforeEach(() => vi.clearAllMocks());

    it('cria com dados válidos e normaliza o slug para minúsculas', async () => {
        vi.mocked(repo.findBySlug).mockResolvedValue(null);
        vi.mocked(repo.create).mockResolvedValue({ id: 'c1' } as never);

        const r = await new CreateConvenioUseCase(repo).execute({ ...validInput,
slug: '  Odonto-Sul ' });

        expect(r.error).toBeUndefined();
        expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ slug: 'odonto-sul' }));
    });

    it('texto opcional vazio vira null', async () => {
        vi.mocked(repo.findBySlug).mockResolvedValue(null);
        vi.mocked(repo.create).mockResolvedValue({ id: 'c1' } as never);

        await new CreateConvenioUseCase(repo).execute({ ...validInput,
subtitle: '   ',
aboutText: '' });

        expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ subtitle: null,
aboutText: null }));
    });

    it.each([
        ['slug com espaço', { slug: 'tem espaço' }, 'letras minúsculas'],
        ['nome vazio', { name: '' }, 'nome do convênio'],
        ['título vazio', { title: ' ' }, 'título da página'],
        ['preço negativo', { priceRows: [{ label: 'x',
priceCents: -1 }] }, 'negativo'],
        ['preço fracionado', { priceRows: [{ label: 'x',
priceCents: 10.5 }] }, 'inválido'],
        ['faixa sem rótulo', { priceRows: [{ label: '',
priceCents: 100 }] }, 'faixa'],
        ['documento em branco', { documents: ['RG', '  '] }, 'branco'],
    ])('rejeita %s', async (_nome, patch, trecho) => {
        const r = await new CreateConvenioUseCase(repo).execute({ ...validInput,
...patch });
        expect(r.error).toBeInstanceOf(ValidationError);
        expect(r.error?.message).toContain(trecho);
        expect(repo.create).not.toHaveBeenCalled();
    });

    it('rejeita slug já usado', async () => {
        vi.mocked(repo.findBySlug).mockResolvedValue(existing);
        const r = await new CreateConvenioUseCase(repo).execute(validInput);
        expect(r.error).toBeInstanceOf(ConvenioSlugAlreadyExistsError);
        expect(repo.create).not.toHaveBeenCalled();
    });
});

describe('UpdateConvenioUseCase', () => {
    beforeEach(() => vi.clearAllMocks());

    it('404 quando o convênio não existe', async () => {
        vi.mocked(repo.findById).mockResolvedValue(null);
        const r = await new UpdateConvenioUseCase(repo).execute('x', { order: 2 });
        expect(r.error).toBeInstanceOf(ConvenioNotFoundError);
    });

    it('atualização parcial não exige campos obrigatórios', async () => {
        vi.mocked(repo.findById).mockResolvedValue(existing);
        vi.mocked(repo.update).mockResolvedValue(existing);
        const r = await new UpdateConvenioUseCase(repo).execute('c1', { isActive: false });
        expect(r.error).toBeUndefined();
        expect(repo.update).toHaveBeenCalledWith('c1', { isActive: false });
    });

    it('rejeita trocar para slug de outro convênio', async () => {
        vi.mocked(repo.findById).mockResolvedValue(existing);
        vi.mocked(repo.findBySlug).mockResolvedValue({ id: 'outro',
slug: 'odonto' } as never);
        const r = await new UpdateConvenioUseCase(repo).execute('c1', { slug: 'odonto' });
        expect(r.error).toBeInstanceOf(ConvenioSlugAlreadyExistsError);
        expect(repo.update).not.toHaveBeenCalled();
    });

    it('manter o mesmo slug não conta como conflito', async () => {
        vi.mocked(repo.findById).mockResolvedValue(existing);
        vi.mocked(repo.update).mockResolvedValue(existing);
        const r = await new UpdateConvenioUseCase(repo).execute('c1', { slug: 'unimed',
name: 'Unimed Vale' });
        expect(r.error).toBeUndefined();
        expect(repo.findBySlug).not.toHaveBeenCalled();
    });

    it('aceita logoUrl null (remover logo) mas não uma URL qualquer', async () => {
        vi.mocked(repo.findById).mockResolvedValue(existing);
        vi.mocked(repo.update).mockResolvedValue(existing);
        const uc = new UpdateConvenioUseCase(repo);

        expect((await uc.execute('c1', { logoUrl: null })).error).toBeUndefined();
        expect((await uc.execute('c1', { logoUrl: 'https://evil.example/x.png' })).error).toBeInstanceOf(ValidationError);
    });
});

describe('DeleteConvenioUseCase', () => {
    beforeEach(() => vi.clearAllMocks());

    it('exclui quando existe', async () => {
        vi.mocked(repo.findById).mockResolvedValue(existing);
        const r = await new DeleteConvenioUseCase(repo).execute('c1');
        expect(r.error).toBeUndefined();
        expect(repo.delete).toHaveBeenCalledWith('c1');
    });

    it('404 quando não existe', async () => {
        vi.mocked(repo.findById).mockResolvedValue(null);
        const r = await new DeleteConvenioUseCase(repo).execute('x');
        expect(r.error).toBeInstanceOf(ConvenioNotFoundError);
        expect(repo.delete).not.toHaveBeenCalled();
    });
});

describe('GetPublicConvenioUseCase', () => {
    beforeEach(() => vi.clearAllMocks());

    it('retorna convênio ativo pelo slug (sem diferenciar maiúsculas)', async () => {
        vi.mocked(repo.findBySlug).mockResolvedValue(existing);
        const r = await new GetPublicConvenioUseCase(repo).execute('UNIMED');
        expect(r.convenio).toBe(existing);
        expect(repo.findBySlug).toHaveBeenCalledWith('unimed');
    });

    it('convênio inativo responde como inexistente', async () => {
        vi.mocked(repo.findBySlug).mockResolvedValue({ ...(existing as object),
isActive: false } as never);
        const r = await new GetPublicConvenioUseCase(repo).execute('unimed');
        expect(r.error).toBeInstanceOf(ConvenioNotFoundError);
    });
});
