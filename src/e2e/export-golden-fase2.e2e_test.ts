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
    await prisma.property.create({
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

    // Por último: as gravações acima mexem no `updatedAt` (é @updatedAt).
    await prisma.$executeRaw`UPDATE "Company" SET "createdAt" = ${d('2026-01-02T15:30:00.000Z')}, "updatedAt" = ${d('2026-03-04T02:05:00.000Z')} WHERE id = ${agro.id}`;
    await prisma.$executeRaw`UPDATE "Company" SET "createdAt" = ${d('2026-09-16T23:30:00.000Z')}, "updatedAt" = ${d('2026-09-16T23:30:00.000Z')} WHERE id = ${coop.id}`;

    Object.assign(ids, { joao: joao.id,
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
