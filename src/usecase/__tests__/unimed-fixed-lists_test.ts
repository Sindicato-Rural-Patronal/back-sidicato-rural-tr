import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateUnimedUseCase } from '../create-unimed.js';
import { UpdateUnimedUseCase } from '../update-unimed.js';
import { ListUnimedUseCase } from '../list-unimed.js';
import { unimedFieldsIssue } from '../../lib/unimed-options.js';
import type { UnimedRepository } from '../../ports/external/unimed-repository.js';

const repo = {
    create: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
    findById: vi.fn(),
    findByUserDataId: vi.fn(),
    list: vi.fn(),
} as unknown as UnimedRepository;

const userDataId = '2b3c4d5e-6f70-4a1b-8c2d-3e4f5a6b7c8d';

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(repo.findByUserDataId).mockResolvedValue(null);
    vi.mocked(repo.create).mockResolvedValue({ id: 'u1' } as never);
    vi.mocked(repo.update).mockResolvedValue({ id: 'u1' } as never);
    vi.mocked(repo.list).mockResolvedValue({ items: [],
total: 0 });
});

describe('listas fixas da Unimed', () => {
    it('aceita valor da lista e recusa valor fora dela ao cadastrar', async () => {
        const uc = new CreateUnimedUseCase(repo);

        const ok = await uc.execute(
            { userDataId,
tipoMovimento: 'INCLUSAO DE TITULAR',
grauDependencia: 'TITULAR' },
            null,
        );
        expect(ok.error).toBeUndefined();

        const bad = await uc.execute({ userDataId,
tipoMovimento: 'QUALQUER COISA' }, null);
        expect(bad.error?.message).toContain('Tipo de movimento inválido');

        const badGrau = await uc.execute({ userDataId,
grauDependencia: 'PRIMO' }, null);
        expect(badGrau.error?.message).toContain('Grau de dependência inválido');
    });

    it('mantém o valor antigo do próprio registro ao editar', async () => {
        vi.mocked(repo.findById).mockResolvedValue({
            id: 'u1',
            tipoMovimento: 'INCLUSAO TITULAR',
            grauDependencia: 'titular',
            cns: '1234',
        } as never);
        const uc = new UpdateUnimedUseCase(repo);

        const keep = await uc.execute('u1', {
            tipoMovimento: 'INCLUSAO TITULAR',
            grauDependencia: 'titular',
            cns: '1234',
        });
        expect(keep.error).toBeUndefined();

        const other = await uc.execute('u1', { tipoMovimento: 'OUTRO TEXTO LIVRE' });
        expect(other.error?.message).toContain('Tipo de movimento inválido');
    });
});

describe('CNS', () => {
    it('grava só os dígitos e exige 15', async () => {
        const uc = new CreateUnimedUseCase(repo);

        const ok = await uc.execute({ userDataId,
cns: '702 3061 4844 8619' }, null);
        expect(ok.error).toBeUndefined();
        expect(vi.mocked(repo.create).mock.calls[0]?.[0].cns).toBe('702306148448619');

        const short = await uc.execute({ userDataId,
cns: '7023061' }, null);
        expect(short.error?.message).toContain('15 dígitos');
    });

    it('helper aceita valor antigo mascarado do próprio registro', () => {
        expect(unimedFieldsIssue({ cns: '1234' }, { cns: '12 34' })).toBeNull();
        expect(unimedFieldsIssue({ cns: '1234' }, { cns: '9999' })).toContain('15 dígitos');
    });
});

describe('filtro por pessoa', () => {
    it('repassa userDataId para o repositório', async () => {
        await new ListUnimedUseCase(repo).execute({ userDataId });
        expect(vi.mocked(repo.list).mock.calls[0]?.[0]).toMatchObject({ userDataId });
    });
});
