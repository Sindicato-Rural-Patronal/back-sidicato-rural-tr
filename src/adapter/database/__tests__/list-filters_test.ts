import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
    buildAdminListWhere,
    buildCompanyListWhere,
    buildUnimedListWhere,
    buildUserListWhere,
    searchKey,
} from '../list-filters.js';

const ci = (value: string) => ({ contains: value,
mode: 'insensitive' });

describe('searchKey', () => {
    it('tira acento e deixa minúsculo', () => {
        expect(searchKey('João Conceição')).toBe('joao conceicao');
        expect(searchKey('ÂNGELO MÜLLER')).toBe('angelo muller');
        expect(searchKey('joao')).toBe('joao');
    });

    it('bate com a tabela do immutable_unaccent_lower() da migration', () => {
        const sql = readFileSync(
            new URL('../../../../prisma/migrations/20260919100000_search_normalized/migration.sql', import.meta.url),
            'utf8',
        );
        const m = sql.match(/translate\(\s*\$1,\s*'([^']+)',\s*'([^']+)'/);
        expect(m).not.toBeNull();
        const from = [...m![1]];
        const to = [...m![2]];
        expect(from).toHaveLength(to.length);
        // translate() + lower() do SQL, letra por letra, igual ao searchKey()
        for (let i = 0; i < from.length; i++) {
            expect(searchKey(from[i])).toBe(to[i].toLowerCase());
        }
    });
});

describe('buildUserListWhere', () => {
    it('sem busca não filtra por texto', () => {
        expect(buildUserListWhere()).toEqual({ isDeleted: false });
        expect(buildUserListWhere({ search: '   ' })).toEqual({ isDeleted: false });
    });

    it('nome sem acento: "joao" procura na coluna nameSearch', () => {
        const where = buildUserListWhere({ search: ' joao ' });
        expect(where.OR).toEqual([
            { nameSearch: { contains: 'joao' } },
            { name: ci('joao') },
            { email: ci('joao') },
        ]);
    });

    it('"João" vira "joao" (acha JOAO e João) e também procura o e-mail sem acento', () => {
        const where = buildUserListWhere({ search: 'João' });
        expect(where.OR).toEqual([
            { nameSearch: { contains: 'joao' } },
            { name: ci('João') },
            { email: ci('João') },
            { email: ci('joao') },
        ]);
    });

    it('CPF com ou sem máscara procura pelos dígitos', () => {
        const masked = buildUserListWhere({ search: '123.456.789-0' });
        const digits = buildUserListWhere({ search: '1234567890' });
        expect(masked.OR).toContainEqual({ cpf: { contains: '1234567890' } });
        expect(digits.OR).toContainEqual({ cpf: { contains: '1234567890' } });
    });

    it('texto com número não vira busca por CPF', () => {
        const where = buildUserListWhere({ search: 'joao 1' });
        expect(JSON.stringify(where.OR)).not.toContain('cpf');
    });

    it('mantém os outros filtros junto da busca', () => {
        const where = buildUserListWhere({ search: 'maria',
memberType: 'ALUNO',
incompleteRegistration: true });
        expect(where.OR).toBeDefined();
        expect(where.memberType).toBe('ALUNO');
        expect(where.AND).toHaveLength(1);
    });
});

describe('buildCompanyListWhere', () => {
    it('razão social e nome fantasia sem acento', () => {
        const where = buildCompanyListWhere({ search: 'São José' });
        expect(where.OR).toEqual([
            { nameSearch: { contains: 'sao jose' } },
            { name: ci('São José') },
            { tradeNameSearch: { contains: 'sao jose' } },
            { tradeName: ci('São José') },
            { email: ci('São José') },
            { email: ci('sao jose') },
        ]);
    });

    it('CNPJ com máscara procura pelos dígitos (a partir de 2)', () => {
        expect(buildCompanyListWhere({ search: '12.345/0001' }).OR).toContainEqual({ cnpj: { contains: '123450001' } });
        expect(JSON.stringify(buildCompanyListWhere({ search: '1' }).OR)).not.toContain('cnpj');
        expect(JSON.stringify(buildCompanyListWhere({ search: 'Loja 12' }).OR)).not.toContain('cnpj');
    });

    it('filtros de tipo e parceria continuam', () => {
        expect(buildCompanyListWhere({ type: 'PUBLIC',
isPartner: false })).toEqual({
            isDeleted: false,
            type: 'PUBLIC',
            isPartner: false,
        });
    });
});

describe('buildUnimedListWhere', () => {
    it('busca pelo nome sem acento e pelo CPF da pessoa', () => {
        expect(buildUnimedListWhere('Conceição')).toEqual({
            isDeleted: false,
            userData: { OR: [{ nameSearch: { contains: 'conceicao' } }, { name: ci('Conceição') }] },
        });
        expect(buildUnimedListWhere('111.444')).toEqual({
            isDeleted: false,
            userData: {
                OR: [
                    { nameSearch: { contains: '111.444' } },
                    { name: ci('111.444') },
                    { cpf: { contains: '111444' } },
                ],
            },
        });
        expect(buildUnimedListWhere('')).toEqual({ isDeleted: false });
    });
});

describe('buildAdminListWhere', () => {
    it('usuário, nome sem acento e e-mail da pessoa', () => {
        const where = buildAdminListWhere({ search: 'José',
rulesId: 'r1' });
        expect(where.rulesId).toBe('r1');
        expect(where.OR).toEqual([
            { username: ci('José') },
            { userData: { nameSearch: { contains: 'jose' } } },
            { userData: { name: ci('José') } },
            { userData: { email: ci('José') } },
            { userData: { email: ci('jose') } },
        ]);
    });
});
