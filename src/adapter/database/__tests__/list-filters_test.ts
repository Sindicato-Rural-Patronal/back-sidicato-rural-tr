import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
    buildAdminListWhere,
    buildCompanyListWhere,
    buildCourseListWhere,
    buildUnimedListWhere,
    buildUserListWhere,
    searchKey,
    splitCourseSearch,
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

    it('telefone procura nos três campos, pelos dígitos e como digitado', () => {
        const where = buildUserListWhere({ search: '(44) 99999-0001' });
        for (const field of ['phone', 'phone2', 'phone3']) {
            // Cadastro novo (só dígitos) e cadastro antigo (gravado com máscara).
            expect(where.OR).toContainEqual({ [field]: { contains: '44999990001' } });
            expect(where.OR).toContainEqual({ [field]: { contains: '(44) 99999-0001' } });
        }
    });

    it('telefone só com dígitos não repete a condição', () => {
        const where = buildUserListWhere({ search: '99999000' });
        expect(where.OR?.filter(c => 'phone' in c)).toEqual([{ phone: { contains: '99999000' } }]);
    });

    it('busca curta ou com texto não procura telefone', () => {
        expect(JSON.stringify(buildUserListWhere({ search: '44' }).OR)).not.toContain('phone');
        expect(JSON.stringify(buildUserListWhere({ search: 'joao 1' }).OR)).not.toContain('phone');
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

    it('telefone da empresa entra na busca', () => {
        const where = buildCompanyListWhere({ search: '44 3645-1234' });
        expect(where.OR).toContainEqual({ phone: { contains: '4436451234' } });
        expect(where.OR).toContainEqual({ phone3: { contains: '44 3645-1234' } });
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
                    { phone: { contains: '111444' } },
                    { phone2: { contains: '111444' } },
                    { phone3: { contains: '111444' } },
                    { phone: { contains: '111.444' } },
                    { phone2: { contains: '111.444' } },
                    { phone3: { contains: '111.444' } },
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


describe('splitCourseSearch', () => {
    it('sem busca nao separa nada', () => {
        expect(splitCourseSearch()).toEqual({});
        expect(splitCourseSearch('   ')).toEqual({});
    });

    it('4 digitos soltos viram o ano', () => {
        expect(splitCourseSearch('2023')).toEqual({ year: 2023 });
        expect(splitCourseSearch('2023 horta')).toEqual({ year: 2023,
text: 'horta' });
        expect(splitCourseSearch('horta 2023')).toEqual({ year: 2023,
text: 'horta' });
    });

    it('numero que nao e ano continua sendo texto', () => {
        // Numero de evento costuma ter 4 digitos tambem: fora da faixa de anos
        // ele tem de continuar procuravel como texto.
        expect(splitCourseSearch('1200')).toEqual({ text: '1200' });
        expect(splitCourseSearch('123')).toEqual({ text: '123' });
        expect(splitCourseSearch('20233')).toEqual({ text: '20233' });
    });

    it('so o primeiro ano conta; o resto e texto', () => {
        expect(splitCourseSearch('2023 2024')).toEqual({ year: 2023,
text: '2024' });
    });
});

describe('buildCourseListWhere', () => {
    it('sem filtro so tira os excluidos', () => {
        expect(buildCourseListWhere()).toEqual({ isDeleted: false });
    });

    it('ano vira faixa de datas do ano inteiro', () => {
        expect(buildCourseListWhere({ search: '2023' })).toEqual({
            isDeleted: false,
            startTime: { gte: new Date(Date.UTC(2023, 0, 1)),
lt: new Date(Date.UTC(2024, 0, 1)) },
        });
    });

    it('texto procura no nome E no numero do evento', () => {
        expect(buildCourseListWhere({ search: 'horta' })).toEqual({
            isDeleted: false,
            OR: [{ name: ci('horta') }, { eventNumber: ci('horta') }],
        });
    });

    it('ano e texto juntos estreitam dentro do ano', () => {
        expect(buildCourseListWhere({ search: 'horta 2023' })).toEqual({
            isDeleted: false,
            startTime: { gte: new Date(Date.UTC(2023, 0, 1)),
lt: new Date(Date.UTC(2024, 0, 1)) },
            OR: [{ name: ci('horta') }, { eventNumber: ci('horta') }],
        });
    });

    it('a situacao continua valendo junto com a busca', () => {
        expect(buildCourseListWhere({ status: 'COMPLETED', search: '2023' })).toMatchObject({
            status: 'COMPLETED',
            startTime: { gte: new Date(Date.UTC(2023, 0, 1)) },
        });
    });
});


describe('buildUserListWhere — associados em dia', () => {
    it('sem o filtro, nao mexe em situacao nem validade', () => {
        expect(buildUserListWhere()).not.toHaveProperty('memberStatus');
    });

    it('exige situacao ATIVO e validade nao vencida', () => {
        const where = buildUserListWhere({ activeMember: true }) as Record<string, unknown>;
        expect(where.memberStatus).toBe('ACTIVE');
        // Validade em branco tambem conta como em dia — dai o OR.
        const and = where.AND as { OR: unknown[] }[];
        expect(and[0].OR).toHaveLength(2);
        expect(and[0].OR[0]).toEqual({ membershipValidUntil: null });
    });

    it('a validade compara so pela data (vale o dia inteiro)', () => {
        const where = buildUserListWhere({ activeMember: true }) as Record<string, unknown>;
        const and = where.AND as { OR: { membershipValidUntil?: { gte?: Date } }[] }[];
        const gte = and[0].OR[1].membershipValidUntil?.gte as Date;
        expect(gte.getHours()).toBe(0);
        expect(gte.getMinutes()).toBe(0);
        expect(gte.getSeconds()).toBe(0);
    });

    it('convive com a busca por texto sem atropelar o OR dela', () => {
        const where = buildUserListWhere({ activeMember: true, search: 'joao' }) as Record<string, unknown>;
        // O OR de cima e o da busca; o da validade fica dentro do AND.
        expect(Array.isArray(where.OR)).toBe(true);
        expect(Array.isArray(where.AND)).toBe(true);
    });
});
