import { describe, it, expect, vi } from 'vitest';
import { parsePhoneEnd, phoneDigits, phoneEndMatches, phoneMatches } from '../../lib/phone-match.js';
import { CpfAttemptLimiter } from '../../lib/cpf-attempt-limiter.js';
import { LookupUserByCpfUseCase } from '../lookup-user-by-cpf.js';
import type { UserDataRepository } from '../../ports/external/user-data-repository.js';
import { TooManyAttemptsError } from '../../errors/too-many-attempts.js';
import { ValidationError } from '../../errors/validation.js';

// SR-025: a consulta e as inscrições públicas por CPF conferem o telefone.

const phones = (phone: string | null, phone2: string | null = null, phone3: string | null = null) => ({ phone,
phone2,
phone3 });

describe('phone-match', () => {
    it('só dígitos, sem o DDI 55', () => {
        expect(phoneDigits('+55 (44) 99123-4567')).toBe('44991234567');
        expect(phoneDigits('5544991234567')).toBe('44991234567');
        expect(phoneDigits('(44) 3624-1234')).toBe('4436241234');
        // 55 no começo de um número sem DDI não é DDI.
        expect(phoneDigits('5512-3456')).toBe('55123456');
        expect(phoneDigits(null)).toBe('');
    });

    it('4 últimos dígitos: exatamente 4, com ou sem máscara', () => {
        expect(parsePhoneEnd('4567')).toBe('4567');
        expect(parsePhoneEnd('45-67')).toBe('4567');
        expect(parsePhoneEnd('456')).toBeNull();
        expect(parsePhoneEnd('34567')).toBeNull();
        expect(parsePhoneEnd('')).toBeNull();
    });

    it('final confere com qualquer um dos três telefones, com máscara antiga', () => {
        const p = phones('(44) 99123-4567', '44 3624-1111', '+55 44 98888-2222');
        expect(phoneEndMatches(p, '4567')).toBe(true);
        expect(phoneEndMatches(p, '1111')).toBe(true);
        expect(phoneEndMatches(p, '2222')).toBe(true);
        expect(phoneEndMatches(p, '9999')).toBe(false);
    });

    it('cadastro sem telefone (ou com lixo curto) nunca confere', () => {
        expect(phoneEndMatches(phones('', null, null), '0000')).toBe(false);
        expect(phoneEndMatches(phones('12', null, null), '0012')).toBe(false);
        expect(phoneMatches(phones('', null, null), '44991234567')).toBe(false);
    });

    it('telefone completo: últimos 8 dígitos, ignorando DDD, DDI e o nono dígito', () => {
        const p = phones('(44) 99123-4567');
        expect(phoneMatches(p, '44991234567')).toBe(true);
        expect(phoneMatches(p, '+55 44 99123-4567')).toBe(true);
        expect(phoneMatches(p, '99123-4567')).toBe(true); // digitou sem DDD
        expect(phoneMatches(phones('9123-4567'), '(44) 99123-4567')).toBe(true); // cadastro antigo, 8 dígitos
        expect(phoneMatches(p, '44991234568')).toBe(false);
        expect(phoneMatches(p, '4567')).toBe(false); // menos de 8 dígitos não identifica
        expect(phoneMatches(phones('11111111', '(44) 99123-4567'), '44991234567')).toBe(true); // o segundo telefone
    });
});

describe('CpfAttemptLimiter', () => {
    it('bloqueia no 5º erro da hora, por CPF (com ou sem máscara), e libera depois da janela', () => {
        let now = 1_000_000;
        const limiter = new CpfAttemptLimiter(5, 60_000, () => now);
        for (let i = 0; i < 4; i++) limiter.recordFailure('529.982.247-25');
        expect(limiter.isBlocked('52998224725')).toBe(false);
        limiter.recordFailure('52998224725');
        expect(limiter.isBlocked('529.982.247-25')).toBe(true);
        expect(limiter.isBlocked('11144477735')).toBe(false); // outro CPF não é afetado

        now += 60_001;
        expect(limiter.isBlocked('52998224725')).toBe(false);
    });

    it('janela deslizante: os erros antigos saem um a um', () => {
        let now = 0;
        const limiter = new CpfAttemptLimiter(2, 100, () => now);
        limiter.recordFailure('1');
        now = 50;
        limiter.recordFailure('1');
        expect(limiter.isBlocked('1')).toBe(true);
        now = 101; // o primeiro venceu, o segundo não
        expect(limiter.isBlocked('1')).toBe(false);
        limiter.recordFailure('1');
        expect(limiter.isBlocked('1')).toBe(true);
    });
});

describe('LookupUserByCpfUseCase', () => {
    const cpf = '52998224725';
    const build = (person: unknown) => {
        const repo = { findByCpf: vi.fn().mockResolvedValue(person) } as unknown as UserDataRepository;
        const limiter = new CpfAttemptLimiter();
        return { uc: new LookupUserByCpfUseCase(repo, limiter),
repo,
limiter };
    };
    const maria = { name: 'MARIA APARECIDA SOUZA',
phone: '(44) 99123-4567',
phone2: null,
phone3: null };

    it('CPF e final certos: nome mascarado', async () => {
        const { uc } = build(maria);
        expect(await uc.execute({ cpf,
phoneEnd: '4567' })).toEqual({ found: true,
name: 'MARIA A. S.' });
    });

    it('final errado e CPF sem cadastro: a mesma resposta, e os dois contam erro', async () => {
        const wrong = build(maria);
        const missing = build(null);
        const a = await wrong.uc.execute({ cpf,
phoneEnd: '0000' });
        const b = await missing.uc.execute({ cpf,
phoneEnd: '0000' });
        expect(a).toEqual({ found: false,
name: null });
        expect(b).toEqual(a);
        for (const { uc, limiter } of [wrong, missing]) {
            for (let i = 0; i < 3; i++) await uc.execute({ cpf,
phoneEnd: '0000' });
            await uc.execute({ cpf,
phoneEnd: '0000' });
            expect(limiter.isBlocked(cpf)).toBe(true);
        }
    });

    it('bloqueado: 429 até com o par certo, sem consultar o banco', async () => {
        const { uc, repo, limiter } = build(maria);
        for (let i = 0; i < 5; i++) limiter.recordFailure(cpf);
        const res = await uc.execute({ cpf,
phoneEnd: '4567' });
        expect(res.error).toBeInstanceOf(TooManyAttemptsError);
        expect(repo.findByCpf).not.toHaveBeenCalled();
    });

    it('final sem 4 dígitos → 400; CPF inválido → não achado, sem consultar nem contar', async () => {
        const { uc, repo, limiter } = build(maria);
        expect((await uc.execute({ cpf,
phoneEnd: '45' })).error).toBeInstanceOf(ValidationError);
        expect(await uc.execute({ cpf: '12345678900',
phoneEnd: '4567' })).toEqual({ found: false,
name: null });
        expect(repo.findByCpf).not.toHaveBeenCalled();
        for (let i = 0; i < 10; i++) await uc.execute({ cpf: '12345678900',
phoneEnd: '4567' });
        expect(limiter.isBlocked('12345678900')).toBe(false);
    });
});
