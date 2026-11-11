import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '../generated/prisma/client.js';
import { createTestApp } from './helpers/create-test-app.js';
import { createTestPrisma, cleanDatabase, seedSuperAdmin, loginAndGetToken, bearer } from './helpers/db.js';

// Teste de ouro pelo banco (decisão 006, item 8): o CSV padrão de `people` e
// `registrations`, byte a byte, a partir de dados gravados de verdade. Cobre o
// que o unitário não cobre: o que o adapter lê (relações, ordem, filtros de
// exclusão). Escrito ANTES do montador de relatórios.
//
// Só duas coisas dependem do dia em que o teste roda, e são calculadas aqui: a
// data no nome do arquivo e a idade (nascimento em 1º de janeiro, então a idade
// é o ano de hoje menos o ano de nascimento).

let app: FastifyInstance;
let prisma: PrismaClient;
let token: string;
const ids: Record<string, string> = {};

const BOM = '﻿';
const line = (cells: string[]) => `${cells.map(c => `"${c}"`).join(';')}\r\n`;
const file = (...lines: string[][]) => BOM + lines.map(line).join('');

/** AAAA-MM-DD de hoje em Brasília. */
const todayBr = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

const d = (iso: string) => new Date(iso);

beforeAll(async () => {
    prisma = createTestPrisma();
    await cleanDatabase(prisma);
    await seedSuperAdmin(prisma);
    app = await createTestApp(prisma);
    token = await loginAndGetToken(app);

    const abel = await prisma.userData.create({
        data: {
            name: 'ABEL GOLDEN',
            nickname: 'BEL',
            cpf: '52998224725',
            rg: '1234567',
            rgIssuer: 'SSP/PR',
            rgIssuedAt: d('2000-03-04T00:00:00.000Z'),
            birthDate: d('1980-01-01T00:00:00.000Z'),
            gender: 'MALE',
            maritalStatus: 'MARRIED',
            nationality: 'BRASILEIRA',
            birthPlace: 'TERRA ROXA',
            ethnicity: 'MIXED',
            educationLevel: 'COMPLETE_SECONDARY',
            specialNeeds: true,
            driverLicense: '01234567890',
            driverLicenseCategory: 'AB',
            email: 'abel@golden.test',
            phone: '44911119001',
            phone2: '(44) 3645-1234',
            phone3: '+55 44 99999-1111',
            memberType: 'PRODUTOR RURAL',
            memberClassification: 'PEQUENO',
            functionalCategory: 'PROPRIETARIO',
            familyIncome: 'ATE 3 SALARIOS',
            cadPro: ['111', '222'],
            memberStatus: 'ACTIVE',
            memberSince: d('2010-01-15T00:00:00.000Z'),
            membershipValidUntil: d('2099-12-31T00:00:00.000Z'),
            memberNotesNumber: '42',
            memberNotes: '=HYPERLINK("http://x")',
            boardMember: true,
            boardPosition: 'TESOUREIRO',
        },
    });
    const zulmira = await prisma.userData.create({ data: { name: 'ZULMIRA VAZIA',
phone: '44911119002' } });

    const rural = await prisma.address.create({
        data: {
            type: 'RURAL',
localityName: 'AGUA DO SOL',
road: 'ESTRADA BOIADEIRA',
km: '12',
lot: '7',
section: 'B',
            city: 'TERRA ROXA',
state: 'PR',
zipCode: '85990000',
        },
    });
    const urban = await prisma.address.create({
        data: {
            type: 'URBAN',
street: 'RUA X',
number: '10',
complement: 'SALA 2; FUNDOS',
neighborhood: 'CENTRO',
            city: 'TERRA ROXA',
state: 'PR',
zipCode: '85990000',
notes: 'PORTÃO AZUL',
        },
    });
    await prisma.property.create({
        data: { name: 'SITIO GOLDEN',
userDataId: abel.id,
addressId: rural.id,
createdAt: d('2026-01-01T10:00:00.000Z') },
    });
    const sede = await prisma.property.create({
        data: {
            name: 'SEDE GOLDEN',
registration: '99',
userDataId: abel.id,
addressId: urban.id,
            createdAt: d('2026-01-02T10:00:00.000Z'),
        },
    });
    await prisma.userData.update({ where: { id: abel.id },
data: { primaryPropertyId: sede.id } });

    const agro = await prisma.company.create({ data: { name: 'AGRO GOLDEN LTDA',
tradeName: 'AGRO GOLDEN',
isPartner: true } });
    const coop = await prisma.company.create({ data: { name: 'COOP GOLDEN' } });
    await prisma.companyMember.create({ data: { companyId: coop.id,
userDataId: abel.id,
title: 'GERENTE' } });
    await prisma.companyMember.create({ data: { companyId: agro.id,
userDataId: abel.id,
title: 'SOCIO' } });
    await prisma.userRelation.create({ data: { sourceId: abel.id,
targetId: zulmira.id,
label: 'IRMA' } });
    await prisma.userInstructor.create({ data: { userDataId: abel.id } });
    await prisma.unimedBeneficiario.create({ data: { userDataId: abel.id,
plano: 'ENFERMARIA' } });
    await prisma.publicContact.create({ data: { userDataId: abel.id,
title: 'PRESIDENTE' } });
    const rule = await prisma.rule.create({ data: { name: 'GOLDEN',
description: 'x',
permissions: ['READ_COURSE'] } });
    await prisma.userAdmin.create({
        data: { username: 'abelgolden',
passwordHash: 'x',
userDataId: abel.id,
rulesId: rule.id },
    });

    const room = await prisma.room.create({ data: { name: 'SALA GOLDEN',
description: 'x',
maxCapacity: 10 } });
    const course = await prisma.course.create({
        data: {
            name: 'CURSO GOLDEN',
eventNumber: '2026/99',
description: 'x',
roomId: room.id,
            startTime: d('2032-03-10T08:00:00.000Z'),
endTime: d('2032-03-10T12:00:00.000Z'),
        },
    });
    const regAbel = await prisma.courseUserRegistration.create({
        data: {
            courseId: course.id,
userDataId: abel.id,
confirmed: true,
attended: true,
            createdAt: d('2026-09-01T12:00:00.000Z'),
        },
    });
    await prisma.registrationFicha.create({
        data: { registrationId: regAbel.id,
data: new Uint8Array([1, 2, 3]),
filename: 'ficha.pdf',
mimeType: 'application/pdf' },
    });
    await prisma.courseUserRegistration.create({
        data: { courseId: course.id,
userDataId: zulmira.id,
createdAt: d('2026-09-16T23:30:00.000Z') },
    });

    // Por último: as gravações acima mexem no `updatedAt` (é @updatedAt).
    await prisma.$executeRaw`UPDATE "UserData" SET "createdAt" = ${d('2026-01-02T15:30:00.000Z')}, "updatedAt" = ${d('2026-03-04T02:05:00.000Z')} WHERE id = ${abel.id}`;
    await prisma.$executeRaw`UPDATE "UserData" SET "createdAt" = ${d('2026-09-16T23:30:00.000Z')}, "updatedAt" = ${d('2026-09-16T23:30:00.000Z')} WHERE id = ${zulmira.id}`;

    Object.assign(ids, { abel: abel.id,
zulmira: zulmira.id,
course: course.id });
});

afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
});

const get = (url: string) => app.inject({ method: 'GET',
url,
headers: bearer(token) });

describe('teste de ouro pelo banco', () => {
    it('pessoas: o CSV padrão inteiro', async () => {
        const res = await get(`/admin/export/people?ids=${ids.zulmira},${ids.abel}`);
        expect(res.statusCode, res.body).toBe(200);
        expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
        expect(res.headers['content-disposition']).toBe(`attachment; filename="pessoas-${todayBr()}.csv"`);
        expect(res.headers['x-export-count']).toBe('2');
        expect(res.body).toBe(
            file(
                [
                    'Nome', 'Apelido', 'CPF', 'RG', 'Órgão emissor', 'Emissão do RG', 'Nascimento', 'Sexo',
                    'Estado civil', 'Nacionalidade', 'Naturalidade', 'Etnia', 'Escolaridade', 'Necessidades especiais',
                    'CNH', 'Categoria CNH', 'E-mail', 'Telefone', 'Telefone 2', 'Telefone 3', 'Tipo de membro',
                    'Classificação', 'Categoria funcional', 'Renda familiar', 'CAD/PRO', 'Situação de associado',
                    'Associado em dia', 'Associado desde', 'Associado até', 'Nº da observação', 'Observações',
                    'Diretoria', 'Cargo na diretoria', 'Propriedade principal', 'Endereço: Tipo', 'Endereço: Rua',
                    'Endereço: Número', 'Endereço: Complemento', 'Endereço: Bairro', 'Endereço: Localidade',
                    'Endereço: Estrada', 'Endereço: Km', 'Endereço: Lote', 'Endereço: Seção', 'Endereço: Cidade',
                    'Endereço: UF', 'Endereço: CEP', 'Todas as propriedades', 'Empresas vinculadas', 'Relacionamentos',
                    'Instrutor', 'Usuário do painel', 'Unimed', 'Contato público', 'Inscrições em cursos',
                    'Cadastrado em', 'Atualizado em',
                ],
                [
                    'ABEL GOLDEN', 'BEL', '529.982.247-25', '1234567', 'SSP/PR', '04/03/2000', '01/01/1980', 'Masculino',
                    'Casado(a)', 'BRASILEIRA', 'TERRA ROXA', 'Parda', 'Médio completo', 'Sim',
                    '01234567890', 'AB', 'abel@golden.test', '44911119001', '(44) 3645-1234', `'+55 44 99999-1111`,
                    'PRODUTOR RURAL', 'PEQUENO', 'PROPRIETARIO', 'ATE 3 SALARIOS', '111 | 222', 'Ativo',
                    'Sim', '15/01/2010', '31/12/2099', '42', `'=HYPERLINK(""http://x"")`,
                    'Sim', 'TESOUREIRO', 'SEDE GOLDEN', 'Urbano', 'RUA X',
                    '10', 'SALA 2; FUNDOS', 'CENTRO', '',
                    '', '', '', '', 'TERRA ROXA',
                    'PR', '85990-000',
                    'SITIO GOLDEN: ESTRADA BOIADEIRA - AGUA DO SOL, km 12, lote 7, seção B - TERRA ROXA/PR - 85990-000'
                        + ' | SEDE GOLDEN (matrícula 99): RUA X, 10 - SALA 2; FUNDOS - CENTRO - TERRA ROXA/PR - 85990-000',
                    'AGRO GOLDEN (SOCIO) | COOP GOLDEN (GERENTE)', 'ZULMIRA VAZIA (IRMA)',
                    'Sim', 'abelgolden', 'ENFERMARIA', 'PRESIDENTE', '1',
                    '02/01/2026 12:30', '03/03/2026 23:05',
                ],
                [
                    'ZULMIRA VAZIA', '', '', '', '', '', '', '',
                    '', '', '', '', '', 'Não',
                    '', '', '', '44911119002', '', '',
                    '', '', '', '', '', '',
                    'Não', '', '', '', '',
                    'Não', '', '', '', '',
                    '', '', '', '',
                    '', '', '', '', '',
                    '', '',
                    '',
                    '', '',
                    'Não', '', '', '', '1',
                    '16/09/2026 20:30', '16/09/2026 20:30',
                ],
            ),
        );
    });

    it('inscrições: o CSV padrão inteiro', async () => {
        const age = String(Number(todayBr().slice(0, 4)) - 1980);
        const res = await get(`/admin/export/registrations?courseIds=${ids.course}`);
        expect(res.statusCode, res.body).toBe(200);
        expect(res.headers['content-disposition']).toBe(`attachment; filename="inscricoes-${todayBr()}.csv"`);
        expect(res.headers['x-export-count']).toBe('2');
        expect(res.body).toBe(
            file(
                [
                    'Curso', 'Nº do evento', 'Início do curso', 'Nome', 'CPF', 'E-mail', 'Telefone', 'Nascimento',
                    'Idade', 'Confirmada', 'Presença', 'Associado em dia', 'Empresa parceira', 'Cargo na diretoria',
                    'Contato público', 'Ficha anexada', 'Inscrito em',
                ],
                [
                    'CURSO GOLDEN', '2026/99', '10/03/2032 08:00', 'ABEL GOLDEN', '529.982.247-25', 'abel@golden.test',
                    '44911119001', '01/01/1980', age, 'Sim', 'Presente', 'Sim', 'AGRO GOLDEN', 'TESOUREIRO',
                    'PRESIDENTE', 'Sim', '01/09/2026 09:00',
                ],
                [
                    'CURSO GOLDEN', '2026/99', '10/03/2032 08:00', 'ZULMIRA VAZIA', '', '', '44911119002', '',
                    '', 'Não', '', 'Não', '', '',
                    '', 'Não', '16/09/2026 20:30',
                ],
            ),
        );
    });

    it('um registro pelo id: mesmo formato, nome da pessoa no arquivo', async () => {
        const res = await get(`/admin/export/people?ids=${ids.zulmira}`);
        expect(res.headers['content-disposition']).toBe(`attachment; filename="pessoa-zulmira-vazia-${todayBr()}.csv"`);
        expect(res.body.split('\r\n')).toHaveLength(3);
    });
});
