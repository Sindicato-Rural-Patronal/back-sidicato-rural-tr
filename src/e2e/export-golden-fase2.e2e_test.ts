import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '../generated/prisma/client.js';
import { createTestApp } from './helpers/create-test-app.js';
import { createTestPrisma, cleanDatabase, seedSuperAdmin, loginAndGetToken, bearer } from './helpers/db.js';

// Teste de ouro pelo banco da fase 2 (decisão 006, item 8): o CSV padrão de
// cada fonte que passa para o montador de relatórios, byte a byte, a partir de
// dados gravados de verdade. Cobre o que o unitário não cobre: o que o adapter
// lê (relações, ordem, filtros de exclusão). Cada bloco foi escrito ANTES de a
// fonte dele sair do caminho antigo.
//
// Só a data no nome do arquivo depende do dia em que o teste roda.

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

const ADDRESS_HEADERS = ['Tipo', 'Rua', 'Número', 'Complemento', 'Bairro', 'Localidade', 'Estrada', 'Km', 'Lote', 'Seção', 'Cidade', 'UF', 'CEP'];
const NO_ADDRESS = ['', '', '', '', '', '', '', '', '', '', '', '', ''];

beforeAll(async () => {
    prisma = createTestPrisma();
    await cleanDatabase(prisma);
    await seedSuperAdmin(prisma);
    app = await createTestApp(prisma);
    token = await loginAndGetToken(app);

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
            notes: 'PERTO DO RIO',
        },
    });
    const sedeAddress = await prisma.address.create({
        data: {
            type: 'URBAN',
            street: 'RUA X',
            number: '10',
            complement: 'SALA 2; FUNDOS',
            neighborhood: 'CENTRO',
            city: 'TERRA ROXA',
            state: 'PR',
            zipCode: '85990000',
        },
    });

    // Pessoas
    const joao = await prisma.userData.create({ data: { name: 'JOAO OURO',
cpf: '52998224725',
phone: '44911118001' } });
    const maria = await prisma.userData.create({ data: { name: 'MARIA OURO',
phone: '44911118002' } });
    const excluida = await prisma.userData.create({
        data: { name: 'EXCLUIDA OURO',
phone: '44911118003',
isDeleted: true,
deletedAt: d('2026-01-01T00:00:00.000Z') },
    });

    // Empresas: uma completa (sede, vínculos, propriedades) e uma vazia.
    const agro = await prisma.company.create({
        data: {
            name: 'AGRO "OURO" LTDA',
            tradeName: 'AGRO OURO',
            cnpj: '11222333000181',
            stateRegistration: 'ISENTO',
            type: 'PRIVATE',
            email: 'agro@ouro.test',
            phone: '4436451234',
            phone2: '(44) 99999-0000',
            phone3: '+55 44 3333-2222',
            website: 'https://agro.ouro.test',
            notes: '=HYPERLINK("x")',
            isPartner: true,
            partnerUrl: 'https://agro.ouro.test/parceria',
            addressId: sedeAddress.id,
        },
    });
    const coop = await prisma.company.create({ data: { name: 'COOP OURO VAZIA',
type: 'PUBLIC' } });
    await prisma.companyMember.create({ data: { companyId: agro.id,
userDataId: maria.id,
title: 'GERENTE' } });
    await prisma.companyMember.create({ data: { companyId: agro.id,
userDataId: joao.id,
title: 'SOCIO' } });
    // Vínculo com pessoa excluída não sai.
    await prisma.companyMember.create({ data: { companyId: agro.id,
userDataId: excluida.id,
title: 'EX' } });
    await prisma.property.create({
        data: { name: 'FAZENDA OURO',
registration: '5',
companyId: agro.id,
addressId: rural.id,
createdAt: d('2026-01-01T10:00:00.000Z') },
    });
    const lote = await prisma.address.create({ data: { type: 'URBAN',
city: 'GUAIRA',
state: 'PR' } });
    const loteOuro = await prisma.property.create({
        data: { name: 'LOTE OURO',
companyId: agro.id,
addressId: lote.id,
createdAt: d('2026-01-02T10:00:00.000Z') },
    });
    // Propriedade excluída não sai.
    await prisma.property.create({
        data: { name: 'VENDIDA',
companyId: agro.id,
addressId: lote.id,
isDeleted: true,
createdAt: d('2026-01-03T10:00:00.000Z') },
    });

    await prisma.company.update({ where: { id: agro.id },
data: { primaryPropertyId: loteOuro.id } });

    // Propriedades de pessoa: a principal do João (com CPF) e uma da Maria (sem CPF).
    const sitio = await prisma.property.create({
        data: { name: 'SITIO JOAO',
registration: '99',
userDataId: joao.id,
addressId: rural.id,
createdAt: d('2026-02-01T10:00:00.000Z') },
    });
    await prisma.userData.update({ where: { id: joao.id },
data: { primaryPropertyId: sitio.id } });
    const chacaraAddress = await prisma.address.create({
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
        data: { name: 'CHACARA MARIA',
userDataId: maria.id,
addressId: chacaraAddress.id,
createdAt: d('2026-02-02T10:00:00.000Z') },
    });
    // Dono excluído: a propriedade some junto.
    await prisma.property.create({
        data: { name: 'DA EXCLUIDA',
userDataId: excluida.id,
addressId: chacaraAddress.id,
createdAt: d('2026-02-03T10:00:00.000Z') },
    });

    // Por último: as gravações acima mexem no `updatedAt` (é @updatedAt).
    await prisma.$executeRaw`UPDATE "Company" SET "createdAt" = ${d('2026-01-02T15:30:00.000Z')}, "updatedAt" = ${d('2026-03-04T02:05:00.000Z')} WHERE id = ${agro.id}`;
    await prisma.$executeRaw`UPDATE "Company" SET "createdAt" = ${d('2026-09-16T23:30:00.000Z')}, "updatedAt" = ${d('2026-09-16T23:30:00.000Z')} WHERE id = ${coop.id}`;

    Object.assign(ids, { excluida: excluida.id,
sitio: sitio.id,
joao: joao.id,
maria: maria.id,
agro: agro.id,
coop: coop.id });
});

afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
});

const get = (url: string) => app.inject({ method: 'GET',
url,
headers: bearer(token) });

describe('teste de ouro pelo banco: empresas', () => {
    const header = [
        'Razão social', 'Nome fantasia', 'CNPJ', 'Inscrição estadual', 'Tipo', 'E-mail', 'Telefone', 'Telefone 2',
        'Telefone 3', 'Site', ...ADDRESS_HEADERS.map(h => `Sede: ${h}`), 'Pessoas vinculadas', 'Propriedades', 'Parceira',
        'Link da parceria', 'Observações', 'Cadastrada em', 'Atualizada em',
    ];
    const agroRow = [
        'AGRO ""OURO"" LTDA', 'AGRO OURO', '11.222.333/0001-81', 'ISENTO', 'Privada', 'agro@ouro.test', '4436451234',
        '(44) 99999-0000', `'+55 44 3333-2222`, 'https://agro.ouro.test',
        'Urbano', 'RUA X', '10', 'SALA 2; FUNDOS', 'CENTRO', '', '', '', '', '', 'TERRA ROXA', 'PR', '85990-000',
        'JOAO OURO (SOCIO) | MARIA OURO (GERENTE)',
        'FAZENDA OURO (matrícula 5): ESTRADA BOIADEIRA - AGUA DO SOL, km 12, lote 7, seção B - TERRA ROXA/PR - 85990-000'
            + ' | LOTE OURO: GUAIRA/PR',
        'Sim', 'https://agro.ouro.test/parceria', `'=HYPERLINK(""x"")`, '02/01/2026 12:30', '03/03/2026 23:05',
    ];
    const coopRow = [
        'COOP OURO VAZIA', '', '', '', 'Pública', '', '', '', '', '', ...NO_ADDRESS, '', '', 'Não', '', '',
        '16/09/2026 20:30', '16/09/2026 20:30',
    ];

    it('o CSV padrão inteiro, pela busca, na ordem da razão social', async () => {
        const res = await get('/admin/export/companies?search=ouro');
        expect(res.statusCode, res.body).toBe(200);
        expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
        expect(res.headers['content-disposition']).toBe(`attachment; filename="empresas-${todayBr()}.csv"`);
        expect(res.headers['x-export-count']).toBe('2');
        expect(res.body).toBe(file(header, agroRow, coopRow));
    });

    it('filtros da lista: tipo e parceira', async () => {
        expect((await get('/admin/export/companies?search=ouro&type=PUBLIC')).body).toBe(file(header, coopRow));
        expect((await get('/admin/export/companies?search=ouro&isPartner=true')).body).toBe(file(header, agroRow));
    });

    it('uma empresa pelo id: nome fantasia no arquivo', async () => {
        const res = await get(`/admin/export/companies?ids=${ids.agro}`);
        expect(res.headers['content-disposition']).toBe(`attachment; filename="empresa-agro-ouro-${todayBr()}.csv"`);
        expect(res.body).toBe(file(header, agroRow));
    });
});

describe('teste de ouro pelo banco: propriedades', () => {
    const header = [
        'Propriedade', 'Matrícula', 'Dono', 'Nome do dono', 'CPF/CNPJ', 'Principal', ...ADDRESS_HEADERS,
        'Observações do endereço', 'Cadastrada em',
    ];
    const rural = ['Rural', '', '', '', '', 'AGUA DO SOL', 'ESTRADA BOIADEIRA', '12', '7', 'B', 'TERRA ROXA', 'PR', '85990-000'];
    const fazenda = ['FAZENDA OURO', '5', 'Empresa', 'AGRO OURO', '11.222.333/0001-81', 'Não', ...rural, 'PERTO DO RIO', '01/01/2026 07:00'];
    const lote = [
        'LOTE OURO', '', 'Empresa', 'AGRO OURO', '11.222.333/0001-81', 'Sim',
        'Urbano', '', '', '', '', '', '', '', '', '', 'GUAIRA', 'PR', '', '', '02/01/2026 07:00',
    ];
    const sitio = ['SITIO JOAO', '99', 'Pessoa', 'JOAO OURO', '529.982.247-25', 'Sim', ...rural, 'PERTO DO RIO', '01/02/2026 07:00'];
    const chacara = [
        'CHACARA MARIA', '', 'Pessoa', 'MARIA OURO', '', 'Não',
        'Urbano', 'RUA X', '10', 'SALA 2; FUNDOS', 'CENTRO', '', '', '', '', '', 'TERRA ROXA', 'PR', '85990-000',
        'PORTÃO AZUL', '02/02/2026 07:00',
    ];

    it('o CSV padrão inteiro, pelos donos, na ordem de cadastro', async () => {
        const res = await get(`/admin/export/properties?ownerIds=${ids.maria},${ids.agro},${ids.joao},${ids.excluida}`);
        expect(res.statusCode, res.body).toBe(200);
        expect(res.headers['content-disposition']).toBe(`attachment; filename="propriedades-${todayBr()}.csv"`);
        expect(res.headers['x-export-count']).toBe('4');
        expect(res.body).toBe(file(header, fazenda, lote, sitio, chacara));
    });

    it('uma propriedade pelo id: o nome dela no arquivo', async () => {
        const res = await get(`/admin/export/properties?ids=${ids.sitio}`);
        expect(res.headers['content-disposition']).toBe(`attachment; filename="propriedade-sitio-joao-${todayBr()}.csv"`);
        expect(res.body).toBe(file(header, sitio));
    });
});

describe('teste de ouro pelo banco: administradores', () => {
    const header = ['Usuário', 'Nome', 'E-mail', 'CPF', 'Telefone', 'Regra de acesso', 'Criado em'];
    let regra: string;
    let excluido: string;

    beforeAll(async () => {
        const rule = await prisma.rule.create({ data: { name: 'OURO; LEITURA',
description: 'x',
permissions: ['READ_COURSE'] } });
        const outra = await prisma.rule.create({ data: { name: 'OUTRA',
description: 'x',
permissions: ['READ_COURSE'] } });
        const ana = await prisma.userData.create({
            data: { name: 'ANA ADMIN OURO',
email: 'ana@ouro.test',
cpf: '11144477735',
phone: '44911118010' },
        });
        const bia = await prisma.userData.create({ data: { name: 'BIA "ADMIN" OURO',
phone: '+55 44 9999' } });
        const caio = await prisma.userData.create({ data: { name: 'CAIO ADMIN OURO',
phone: '44911118012' } });
        const dora = await prisma.userData.create({ data: { name: 'DORA ADMIN OURO',
phone: '44911118013' } });
        await prisma.userAdmin.create({
            data: { username: 'ana.ouro',
passwordHash: 'x',
userDataId: ana.id,
rulesId: rule.id,
createdAt: d('2026-02-01T10:00:00.000Z') },
        });
        await prisma.userAdmin.create({
            data: { username: '=bia',
passwordHash: 'x',
userDataId: bia.id,
rulesId: rule.id,
createdAt: d('2026-09-16T23:30:00.000Z') },
        });
        await prisma.userAdmin.create({
            data: { username: 'caio.ouro',
passwordHash: 'x',
userDataId: caio.id,
rulesId: outra.id,
createdAt: d('2026-03-01T10:00:00.000Z') },
        });
        // Administrador excluído não sai.
        const old = await prisma.userAdmin.create({
            data: { username: 'dora.ouro',
passwordHash: 'x',
userDataId: dora.id,
rulesId: rule.id,
isDeleted: true },
        });
        regra = rule.id;
        excluido = old.id;
    });

    const ana = ['ana.ouro', 'ANA ADMIN OURO', 'ana@ouro.test', '111.444.777-35', '44911118010', 'OURO; LEITURA', '01/02/2026 07:00'];
    const bia = [`'=bia`, 'BIA ""ADMIN"" OURO', '', '', `'+55 44 9999`, 'OURO; LEITURA', '16/09/2026 20:30'];

    it('o CSV padrão inteiro, pela regra, na ordem do nome', async () => {
        const res = await get(`/admin/export/admins?rulesId=${regra}`);
        expect(res.statusCode, res.body).toBe(200);
        expect(res.headers['content-disposition']).toBe(`attachment; filename="administradores-${todayBr()}.csv"`);
        expect(res.headers['x-export-count']).toBe('2');
        expect(res.body).toBe(file(header, ana, bia));
    });

    it('busca pelo nome; o excluído não sai nem pelo id', async () => {
        expect((await get('/admin/export/admins?search=caio admin')).body).toBe(
            file(header, ['caio.ouro', 'CAIO ADMIN OURO', '', '', '44911118012', 'OUTRA', '01/03/2026 07:00']),
        );
        const res = await get(`/admin/export/admins?ids=${excluido}`);
        expect(res.body).toBe(file(header));
    });
});
