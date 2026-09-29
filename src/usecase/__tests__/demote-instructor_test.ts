import { describe, it, expect, vi } from 'vitest';
import { DemoteInstructorUseCase } from '../demote-instructor.js';
import { PromoteToInstructorUseCase } from '../promote-to-instructor.js';
import type { InstructorRepository } from '../../ports/external/instructor-repository.js';
import type { UserDataRepository } from '../../ports/external/user-data-repository.js';

const PESSOA = 'ud-1';

function repo(over: Partial<InstructorRepository> = {}) {
    return {
        findByUserId: vi.fn().mockResolvedValue({ id: 'i-1',
userDataId: PESSOA }),
        demote: vi.fn().mockResolvedValue(true),
        promote: vi.fn().mockResolvedValue({ id: 'i-1' }),
        ...over,
    } as unknown as InstructorRepository;
}

describe('DemoteInstructorUseCase', () => {
    it('remove quando a pessoa e instrutora', async () => {
        const r = repo();
        expect(await new DemoteInstructorUseCase(r).execute(PESSOA)).toEqual({});
        expect(r.demote).toHaveBeenCalledWith(PESSOA);
    });

    it('avisa quando nada foi removido, em vez de responder sucesso', async () => {
        // Era o buraco: `demote` devolvia false (a FK da escala em curso barrava
        // o DELETE, e o erro morria num catch mudo) e a rota respondia 200 —
        // o painel dizia "removido" e a pessoa continuava instrutora.
        const r = repo({ demote: vi.fn().mockResolvedValue(false) });
        const res = await new DemoteInstructorUseCase(r).execute(PESSOA);
        expect(res.error).toBeInstanceOf(Error);
    });

    it('nao tenta remover quem nao e instrutora', async () => {
        const r = repo({ findByUserId: vi.fn().mockResolvedValue(null) });
        expect((await new DemoteInstructorUseCase(r).execute(PESSOA)).error).toBeInstanceOf(Error);
        expect(r.demote).not.toHaveBeenCalled();
    });
});

describe('PromoteToInstructorUseCase', () => {
    const pessoas = { findById: vi.fn().mockResolvedValue({ id: PESSOA }) } as unknown as UserDataRepository;

    it('promove de novo quem foi removido antes', async () => {
        // Depois do demote a linha continua no banco, so marcada: findByUserId
        // nao a enxerga, e o promote revive a mesma linha (upsert no adapter).
        const r = repo({ findByUserId: vi.fn().mockResolvedValue(null) });
        const res = await new PromoteToInstructorUseCase(r, pessoas).execute({ userDataId: PESSOA });
        expect(res.error).toBeUndefined();
        expect(r.promote).toHaveBeenCalled();
    });

    it('recusa quem ja e instrutora', async () => {
        const r = repo();
        const res = await new PromoteToInstructorUseCase(r, pessoas).execute({ userDataId: PESSOA });
        expect(res.error?.name).toBe('InstructorAlreadyExistsError');
        expect(r.promote).not.toHaveBeenCalled();
    });
});
