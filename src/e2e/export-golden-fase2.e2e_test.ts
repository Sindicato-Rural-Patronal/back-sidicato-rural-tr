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

describe('teste de ouro pelo banco: cursos', () => {
    const header = [
        'Curso', 'Nº do evento', 'Status', 'Início', 'Término', 'Inscrições até', 'Sala', 'Capacidade da sala',
        'Instrutores', 'Carga horária (h)', 'Valor (R$)', 'Mínimo de alunos', 'Inscritos', 'Confirmados',
        'Pré-inscritos', 'Lista de espera', 'Descrição', 'Observações', 'Criado em',
    ];
    let horta: string;

    beforeAll(async () => {
        const room = await prisma.room.create({ data: { name: 'SALA OURO',
description: 'x',
maxCapacity: 50 } });
        const pedro = await prisma.userData.create({ data: { name: 'PEDRO OURO',
phone: '44911118020' } });
        const ana = await prisma.userData.create({ data: { name: 'ANA OURO',
phone: '44911118021' } });
        const instrPedro = await prisma.userInstructor.create({ data: { userDataId: pedro.id } });
        const instrAna = await prisma.userInstructor.create({ data: { userDataId: ana.id } });
        const course = await prisma.course.create({
            data: {
                name: 'Horta "Ouro"',
                description: 'Aprenda; "na prática"',
                eventNumber: '2026/77',
                status: 'PUBLIC',
                roomId: room.id,
                startTime: d('2032-03-10T08:00:00.000Z'),
                endTime: d('2032-03-10T12:00:00.000Z'),
                registrationDeadline: d('2032-03-05T18:30:00.000Z'),
                workloadHours: 4,
                price: 150.5,
                minStudents: 5,
                preEnrolled: 2,
                waitlist: 1,
                observations: '=obs',
            },
        });
        await prisma.courseInstructor.create({ data: { courseId: course.id,
instructorId: instrPedro.id,
title: 'ENGENHEIRO' } });
        await prisma.courseInstructor.create({ data: { courseId: course.id,
instructorId: instrAna.id } });
        await prisma.courseUserRegistration.create({ data: { courseId: course.id,
userDataId: ids.joao,
confirmed: true } });
        await prisma.courseUserRegistration.create({ data: { courseId: course.id,
userDataId: ids.maria } });
        // Inscrição cancelada não conta.
        await prisma.courseUserRegistration.create({
            data: { courseId: course.id,
userDataId: ids.excluida,
confirmed: true,
isDeleted: true },
        });
        const cursoB = await prisma.course.create({
            data: {
                name: 'Curso Ouro B',
                description: 'x',
                status: 'COMPLETED',
                roomId: room.id,
                startTime: d('2031-11-30T19:30:00.000Z'),
                endTime: d('2031-11-30T22:00:00.000Z'),
            },
        });
        // Curso excluído não sai.
        await prisma.course.create({
            data: {
                name: 'Curso Ouro Excluido',
                description: 'x',
                roomId: room.id,
                startTime: d('2031-01-01T08:00:00.000Z'),
                endTime: d('2031-01-01T12:00:00.000Z'),
                isDeleted: true,
            },
        });
        await prisma.$executeRaw`UPDATE "course" SET "createdAt" = ${d('2026-09-01T12:00:00.000Z')} WHERE id = ${course.id}`;
        await prisma.$executeRaw`UPDATE "course" SET "createdAt" = ${d('2026-09-16T23:30:00.000Z')} WHERE id = ${cursoB.id}`;
        horta = course.id;
    });

    const hortaRow = [
        'Horta ""Ouro""', '2026/77', 'Público', '10/03/2032 08:00', '10/03/2032 12:00', '05/03/2032 18:30', 'SALA OURO',
        '50', 'PEDRO OURO (ENGENHEIRO) | ANA OURO', '4', '150,50', '5', '2', '1', '2', '1', 'Aprenda; ""na prática""',
        `'=obs`, '01/09/2026 09:00',
    ];
    const cursoBRow = [
        'Curso Ouro B', '', 'Concluído', '30/11/2031 19:30', '30/11/2031 22:00', '', 'SALA OURO', '50', '', '0', '0,00', '0',
        '0', '0', '0', '0', 'x', '', '16/09/2026 20:30',
    ];

    it('o CSV padrão inteiro, pela busca, na ordem do início', async () => {
        const res = await get('/admin/export/courses?search=ouro');
        expect(res.statusCode, res.body).toBe(200);
        expect(res.headers['content-disposition']).toBe(`attachment; filename="cursos-${todayBr()}.csv"`);
        expect(res.headers['x-export-count']).toBe('2');
        expect(res.body).toBe(file(header, cursoBRow, hortaRow));
    });

    it('filtro de status e um curso pelo id', async () => {
        expect((await get('/admin/export/courses?search=ouro&status=COMPLETED')).body).toBe(file(header, cursoBRow));
        const one = await get(`/admin/export/courses?ids=${horta}`);
        expect(one.headers['content-disposition']).toBe(`attachment; filename="curso-horta-ouro-${todayBr()}.csv"`);
        expect(one.body).toBe(file(header, hortaRow));
    });
});

describe('teste de ouro pelo banco: mensagens de contato', () => {
    const header = ['Recebida em', 'Nome', 'E-mail', 'Telefone', 'Assunto', 'Mensagem', 'Lida'];
    let primeira: string;

    beforeAll(async () => {
        const first = await prisma.contactMessage.create({
            data: {
                name: 'JOAO MENSAGEM',
                email: 'joao@msg.test',
                phone: '44999990000',
                subject: 'Dúvida; "curso"',
                message: 'linha 1\nlinha 2',
                read: true,
                createdAt: d('2026-09-17T02:59:00.000Z'),
            },
        });
        await prisma.contactMessage.create({
            data: { name: '@MARIA MENSAGEM',
email: 'maria@msg.test',
message: '+55 me liga',
createdAt: d('2026-09-18T15:30:00.000Z') },
        });
        // Mensagem excluída não sai.
        await prisma.contactMessage.create({
            data: { name: 'EXCLUIDA MENSAGEM',
email: 'x@msg.test',
message: 'x',
isDeleted: true,
createdAt: d('2026-09-19T15:30:00.000Z') },
        });
        primeira = first.id;
    });

    const joao = ['16/09/2026 23:59', 'JOAO MENSAGEM', 'joao@msg.test', '44999990000', 'Dúvida; ""curso""', 'linha 1\nlinha 2', 'Sim'];
    const maria = ['18/09/2026 12:30', `'@MARIA MENSAGEM`, 'maria@msg.test', '', '', `'+55 me liga`, 'Não'];

    it('o CSV padrão inteiro, pela busca, da mais nova para a mais antiga', async () => {
        const res = await get('/admin/export/contact-messages?search=msg.test');
        expect(res.statusCode, res.body).toBe(200);
        expect(res.headers['content-disposition']).toBe(`attachment; filename="mensagens-${todayBr()}.csv"`);
        expect(res.headers['x-export-count']).toBe('2');
        expect(res.body).toBe(file(header, maria, joao));
    });

    it('filtro de lidas e uma mensagem pelo id', async () => {
        expect((await get('/admin/export/contact-messages?search=msg.test&read=true')).body).toBe(file(header, joao));
        expect((await get('/admin/export/contact-messages?search=msg.test&read=false')).body).toBe(file(header, maria));
        const one = await get(`/admin/export/contact-messages?ids=${primeira}`);
        expect(one.headers['content-disposition']).toBe(`attachment; filename="mensagem-joao-mensagem-${todayBr()}.csv"`);
        expect(one.body).toBe(file(header, joao));
    });
});

describe('teste de ouro pelo banco: Unimed', () => {
    const header = [
        'Nome', 'CPF', 'Nascimento', 'Telefone', 'E-mail', 'Plano', 'Matrícula', 'CNS', 'Nome da mãe', 'Profissão', 'Empresa',
        'Contratante', 'Tipo de movimento', 'Tipo de dependente', 'Grau de dependência', 'Titular', 'Data de adesão', 'Motivo',
        'Observações', 'Cadastrado em',
    ];
    let pedroUnimed: string;

    beforeAll(async () => {
        const joao = await prisma.userData.create({
            data: {
                name: 'JOAO UNIMED',
                cpf: '39053344705',
                birthDate: d('1980-05-10T00:00:00.000Z'),
                phone: '44999990000',
                email: 'joao@unimed.test',
            },
        });
        const pedro = await prisma.userData.create({ data: { name: 'PEDRO UNIMED',
phone: '(44) 9 8888-7777' } });
        const excluido = await prisma.userData.create({ data: { name: 'EXCLUIDO UNIMED',
phone: '44911118030' } });
        await prisma.unimedBeneficiario.create({
            data: {
                userDataId: joao.id,
                dataAdesao: d('2020-03-01T00:00:00.000Z'),
                tipoMovimento: 'INCLUSAO DE TITULAR',
                grauDependencia: 'TITULAR',
                cns: '123456789012345',
                nomeMae: 'MARIA "MÃE"',
                profissao: 'AGRICULTOR',
                plano: 'ENFERMARIA',
                matricula: '0001',
                empresa: 'SINDICATO',
                contratante: 'SINDICATO RURAL',
                obs: '=obs',
                createdAt: d('2026-01-02T15:30:00.000Z'),
            },
        });
        const dependente = await prisma.unimedBeneficiario.create({
            data: {
                userDataId: pedro.id,
                tipoMovimento: 'INCLUSAO DE DEPENDENTE',
                tipoDependente: 'FILHO',
                grauDependencia: 'FILHO(A)',
                cns: '898 0012 3456 7890',
                titularId: joao.id,
                motivo: 'NASCIMENTO',
                createdAt: d('2026-09-16T23:30:00.000Z'),
            },
        });
        // Cadastro excluído não sai.
        await prisma.unimedBeneficiario.create({ data: { userDataId: excluido.id,
plano: 'X',
isDeleted: true } });
        pedroUnimed = dependente.id;
    });

    const joao = [
        'JOAO UNIMED', '390.533.447-05', '10/05/1980', '44999990000', 'joao@unimed.test', 'ENFERMARIA', '0001', '123456789012345',
        'MARIA ""MÃE""', 'AGRICULTOR', 'SINDICATO', 'SINDICATO RURAL', 'INCLUSAO DE TITULAR', '', 'TITULAR', '', '01/03/2020', '',
        `'=obs`, '02/01/2026 12:30',
    ];
    const pedro = [
        'PEDRO UNIMED', '', '', '(44) 9 8888-7777', '', '', '', '898 0012 3456 7890', '', '', '', '', 'INCLUSAO DE DEPENDENTE',
        'FILHO', 'FILHO(A)', 'JOAO UNIMED', '', 'NASCIMENTO', '', '16/09/2026 20:30',
    ];

    it('o CSV padrão inteiro, pela busca, na ordem do nome', async () => {
        const res = await get('/admin/export/unimed?search=unimed');
        expect(res.statusCode, res.body).toBe(200);
        expect(res.headers['content-disposition']).toBe(`attachment; filename="unimed-${todayBr()}.csv"`);
        expect(res.headers['x-export-count']).toBe('2');
        expect(res.body).toBe(file(header, joao, pedro));
    });

    it('um beneficiário pelo id', async () => {
        const res = await get(`/admin/export/unimed?ids=${pedroUnimed}`);
        expect(res.headers['content-disposition']).toBe(`attachment; filename="unimed-pedro-unimed-${todayBr()}.csv"`);
        expect(res.body).toBe(file(header, pedro));
    });
});
