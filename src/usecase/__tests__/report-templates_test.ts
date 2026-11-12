import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Permission } from '../../generated/prisma/enums.js';
import type {
    ReportTemplateModel, ReportTemplateRepository,
} from '../../ports/external/report-template-repository.js';
import {
    ReportTemplatesUseCase, TEMPLATE_LIMITS, TEMPLATE_MESSAGES, readTemplateName, reportTemplateAuditSnapshot,
    type TemplateActor,
} from '../export/report-templates.js';
import { NO_BUILDER_MESSAGE } from '../export/catalog/index.js';
import { ForbiddenError } from '../../errors/auth.js';
import { BusinessRuleError } from '../../errors/business-rule.js';
import { ConflictError } from '../../errors/conflict.js';
import { NotFoundError } from '../../errors/not-found.js';
import { ValidationError } from '../../errors/validation.js';

// Modelos de relatório da equipe (decisão 006, fase 3, SR-114): validação
// contra o catálogo, nome único entre os ativos, permissão por campo,
// soft-delete e o campo que saiu do catálogo.

/** Repositório em memória, com o índice parcial (conjunto + nome sem maiúsculas, só os ativos). */
function memoryRepo() {
    const rows: ReportTemplateModel[] = [];
    const usernames = new Map<string, string>();
    const clash = (dataset: string, name: string, selfId: string | null) =>
        rows.some(r => !r.isDeleted && r.dataset === dataset && r.id !== selfId && r.name.toLowerCase() === name.toLowerCase());
    const p2002 = () => Object.assign(new Error('unique'), { code: 'P2002' });
    let clock = Date.UTC(2026, 10, 11, 12);
    const repo: ReportTemplateRepository = {
        async listActive(dataset) {
            return rows.filter(r => r.dataset === dataset && !r.isDeleted);
        },
        async findActive(dataset, id) {
            return rows.find(r => r.id === id && r.dataset === dataset && !r.isDeleted) ?? null;
        },
        async create(data) {
            if (clash(data.dataset, data.name, null)) throw p2002();
            const now = new Date(clock += 1000);
            const row: ReportTemplateModel = {
                id: randomUUID(),
                ...data,
                updatedById: null,
                isDeleted: false,
                deletedAt: null,
                createdAt: now,
                updatedAt: now,
            };
            rows.push(row);
            return row;
        },
        async update(id, data) {
            const row = rows.find(r => r.id === id && !r.isDeleted);
            if (!row) return null;
            if (data.name !== undefined && clash(row.dataset, data.name, id)) throw p2002();
            Object.assign(row, data, { updatedAt: new Date(clock += 1000) });
            return row;
        },
        async softDelete(id, actorId) {
            const row = rows.find(r => r.id === id && !r.isDeleted);
            if (!row) return false;
            Object.assign(row, { isDeleted: true,
deletedAt: new Date(),
updatedById: actorId });
            return true;
        },
        async adminUsernames(ids) {
            return new Map(ids.filter(id => usernames.has(id)).map(id => [id, usernames.get(id)!]));
        },
    };
    return { repo,
rows,
usernames };
}

const actor = (id: string, permissions: Permission[]): TemplateActor => ({ id,
has: p => permissions.includes(p) });

let mem: ReturnType<typeof memoryRepo>;
let useCase: ReportTemplatesUseCase;
const maria = actor('admin-maria', ['READ_USER', 'READ_COURSE']);
const joana = actor('admin-joana', ['READ_COURSE']);

beforeEach(() => {
    mem = memoryRepo();
    mem.usernames.set('admin-maria', 'maria');
    mem.usernames.set('admin-joana', 'joana');
    useCase = new ReportTemplatesUseCase(mem.repo);
});

describe('salvar um modelo', () => {
    it('grava as chaves na ordem, o formato e quem criou; o alvo da auditoria tem o relatório e o nome', async () => {
        const r = await useCase.create('people', { name: '  Só os   nomes ',
fields: ['name', 'cpf', 'email'],
format: 'pdf' }, maria);
        expect(r.error).toBeUndefined();
        expect(r.template).toMatchObject({
            dataset: 'people',
            name: 'Só os nomes',
            fields: ['name', 'cpf', 'email'],
            missingFields: [],
            format: 'pdf',
            confirmed: null,
            createdBy: { id: 'admin-maria',
username: 'maria' },
            updatedBy: null,
        });
        expect(r.auditLabel).toBe('Pessoas: Só os nomes');
        expect(mem.rows[0]).toMatchObject({ createdById: 'admin-maria',
updatedById: null,
isDeleted: false });
    });

    it('sem formato, fica sem preferência (null); "" também', async () => {
        const a = await useCase.create('people', { name: 'A',
fields: ['name'] }, maria);
        const b = await useCase.create('people', { name: 'B',
fields: ['name'],
format: '' }, maria);
        expect(a.template!.format).toBeNull();
        expect(b.template!.format).toBeNull();
    });

    it('"Só confirmadas" só nas inscrições: false sem ele, true quando vem; null e ignorado nos outros', async () => {
        const off = await useCase.create('registrations', { name: 'Sem filtro',
fields: ['name'] }, maria);
        const on = await useCase.create('registrations', { name: 'Presença',
fields: ['ordinal', 'name', 'signature'],
confirmed: true }, maria);
        const people = await useCase.create('people', { name: 'Pessoas',
fields: ['name'],
confirmed: true }, maria);
        expect(off.template!.confirmed).toBe(false);
        expect(on.template!.confirmed).toBe(true);
        expect(people.template!.confirmed).toBeNull();
    });

    it.each([
        [{ fields: ['name'] }, TEMPLATE_MESSAGES.nameRequired],
        [{ name: '   ',
fields: ['name'] }, TEMPLATE_MESSAGES.nameRequired],
        [{ name: 'x'.repeat(TEMPLATE_LIMITS.name + 1),
fields: ['name'] }, 'O nome do modelo pode ter até 64 caracteres.'],
        [{ name: 'X' }, 'Escolha pelo menos um campo.'],
        [{ name: 'X',
fields: [] }, 'Escolha pelo menos um campo.'],
        [{ name: 'X',
fields: ['name', 'naoExiste'] }, 'Campo desconhecido: naoExiste.'],
        [{ name: 'X',
fields: ['name', 'cpf', 'name'] }, 'Campo repetido: Nome.'],
        [{ name: 'X',
fields: Array.from({ length: 81 }, (_, i) => `f${i}`) }, 'No máximo 80 campos por relatório.'],
        [{ name: 'X',
fields: ['name'],
format: 'doc' }, 'Formato inválido: use csv, pdf ou xlsx.'],
    ])('400: %j → %s', async (body, message) => {
        const r = await useCase.create('people', body, maria);
        expect(r.error).toBeInstanceOf(ValidationError);
        expect(r.error!.message).toBe(message);
        expect(mem.rows).toHaveLength(0);
    });

    it('o nome tem 64 caracteres contados depois de juntar os espaços; caractere de controle vira espaço', async () => {
        expect(readTemplateName(`${'a'.repeat(32)}     ${'b'.repeat(31)}`)).toBe(`${'a'.repeat(32)} ${'b'.repeat(31)}`);
        expect(readTemplateName('Nome\u0000e\tCPF\n')).toBe('Nome e CPF');
        expect(readTemplateName(123)).toBeInstanceOf(ValidationError);
    });

    it('403 com os rótulos quando quem salva não pode exportar algum campo, como na exportação', async () => {
        const r = await useCase.create('registrations', { name: 'Ficha',
fields: ['name', 'rg', 'addressCity'] }, joana);
        expect(r.error).toBeInstanceOf(ForbiddenError);
        expect(r.error!.message).toBe('Sem permissão para exportar: RG, Endereço: Cidade.');
        expect(mem.rows).toHaveLength(0);
        // Quem tem READ_USER salva o mesmo modelo.
        expect((await useCase.create('registrations', { name: 'Ficha',
fields: ['name', 'rg', 'addressCity'] }, maria)).error).toBeUndefined();
    });

    it('409 com nome repetido no mesmo relatório, sem diferenciar maiúsculas; em outro relatório pode', async () => {
        await useCase.create('people', { name: 'Contato da diretoria',
fields: ['name', 'phone'] }, maria);
        const again = await useCase.create('people', { name: 'CONTATO DA DIRETORIA',
fields: ['name'] }, joana);
        expect(again.error).toBeInstanceOf(ConflictError);
        expect(again.error!.message).toBe('Já existe um modelo da equipe com esse nome.');
        const other = await useCase.create('companies', { name: 'Contato da diretoria',
fields: ['name'] }, maria);
        expect(other.error).toBeUndefined();
    });

    it('409 quando outro pedido grava o mesmo nome ao mesmo tempo (o índice do banco segura)', async () => {
        const original = mem.repo.listActive;
        // A conferência não vê o outro; o índice vê.
        mem.repo.listActive = async () => [];
        await mem.repo.create({ dataset: 'people',
name: 'Corrida',
fields: ['name'],
format: null,
confirmed: null,
createdById: 'x' });
        const r = await useCase.create('people', { name: 'corrida',
fields: ['name'] }, maria);
        mem.repo.listActive = original;
        expect(r.error).toBeInstanceOf(ConflictError);
        expect(r.error!.message).toBe(TEMPLATE_MESSAGES.nameTaken);
    });

    it.each(['Nome e CPF', 'nome-cpf', 'NOME E E-MAIL', 'Padrão (como hoje)', 'padrao'])(
        '409: "%s" é nome (ou id) de modelo de fábrica',
        async name => {
            const r = await useCase.create('people', { name,
fields: ['name'] }, maria);
            expect(r.error).toBeInstanceOf(ConflictError);
            expect(r.error!.message).toBe('Já existe um modelo de fábrica com esse nome.');
        },
    );

    it(`409 a partir de ${TEMPLATE_LIMITS.perDataset} modelos ativos no relatório`, async () => {
        for (let i = 0; i < TEMPLATE_LIMITS.perDataset; i++) {
            await mem.repo.create({ dataset: 'people',
name: `M${i}`,
fields: ['name'],
format: null,
confirmed: null,
createdById: 'x' });
        }
        const r = await useCase.create('people', { name: 'Mais um',
fields: ['name'] }, maria);
        expect(r.error).toBeInstanceOf(BusinessRuleError);
        expect(r.error!.message).toBe('Este relatório já tem 100 modelos da equipe. Exclua um antes de salvar outro.');
    });

    it('conjunto sem montador → 404, como o catálogo', async () => {
        const r = await useCase.create('cadastros', { name: 'X',
fields: ['name'] }, maria);
        expect(r.error).toBeInstanceOf(NotFoundError);
        expect(r.error!.message).toBe(NO_BUILDER_MESSAGE);
        expect((await useCase.list('cadastros')).error!.message).toBe(NO_BUILDER_MESSAGE);
        expect((await useCase.update('cadastros', 'x', { name: 'Y' }, maria)).error!.message).toBe(NO_BUILDER_MESSAGE);
        expect((await useCase.remove('cadastros', 'x', maria)).error!.message).toBe(NO_BUILDER_MESSAGE);
    });
});

describe('listar', () => {
    it('só os ativos do relatório, pelo nome; quem criou e quem mudou pelo usuário', async () => {
        await useCase.create('people', { name: 'beta',
fields: ['name'] }, maria);
        const alfa = await useCase.create('people', { name: 'Alfa',
fields: ['cpf'] }, maria);
        await useCase.create('companies', { name: 'Empresas',
fields: ['name'] }, maria);
        await useCase.update('people', alfa.template!.id, { format: 'xlsx' }, joana);

        const r = await useCase.list('people');
        expect(r.templates!.map(t => t.name)).toEqual(['Alfa', 'beta']);
        expect(r.templates![0]).toMatchObject({
            format: 'xlsx',
            createdBy: { id: 'admin-maria',
username: 'maria' },
            updatedBy: { id: 'admin-joana',
username: 'joana' },
        });
    });

    it('lista vazia quando não há modelo', async () => {
        expect((await useCase.list('unimed')).templates).toEqual([]);
    });

    it('campo que saiu do catálogo: some de fields, na ordem, e aparece em missingFields', async () => {
        await mem.repo.create({ dataset: 'people',
name: 'Antigo',
fields: ['name', 'campoQueSaiu', 'cpf'],
format: 'csv',
confirmed: null,
createdById: 'admin-maria' });
        const [t] = (await useCase.list('people')).templates!;
        expect(t.fields).toEqual(['name', 'cpf']);
        expect(t.missingFields).toEqual(['campoQueSaiu']);
    });

    it('campo sem permissão para quem lista vem na lista (o montador tira pelo catálogo)', async () => {
        await useCase.create('registrations', { name: 'Ficha',
fields: ['name', 'rg'] }, maria);
        const [t] = (await useCase.list('registrations')).templates!;
        expect(t.fields).toEqual(['name', 'rg']);
        expect(t.missingFields).toEqual([]);
    });

    it('admin que não é achado: o id fica, o usuário vem null', async () => {
        await useCase.create('people', { name: 'X',
fields: ['name'] }, actor('admin-sumiu', ['READ_USER']));
        const [t] = (await useCase.list('people')).templates!;
        expect(t.createdBy).toEqual({ id: 'admin-sumiu',
username: null });
    });
});

describe('renomear e mudar', () => {
    it('muda só o que veio; renomear cita o nome antigo no alvo', async () => {
        const { template } = await useCase.create('people', { name: 'Contatos',
fields: ['name', 'phone'],
format: 'pdf' }, maria);
        const r = await useCase.update('people', template!.id, { name: 'Contato da equipe' }, joana);
        expect(r.error).toBeUndefined();
        expect(r.template).toMatchObject({ name: 'Contato da equipe',
fields: ['name', 'phone'],
format: 'pdf',
updatedBy: { id: 'admin-joana',
username: 'joana' } });
        expect(r.auditLabel).toBe('Pessoas: Contato da equipe (antes Contatos)');

        const f = await useCase.update('people', template!.id, { fields: ['phone', 'name'],
format: null }, maria);
        expect(f.template).toMatchObject({ fields: ['phone', 'name'],
format: null });
        expect(f.auditLabel).toBe('Pessoas: Contato da equipe');
    });

    it('trocar só as maiúsculas do próprio nome não é conflito', async () => {
        const { template } = await useCase.create('people', { name: 'equipe',
fields: ['name'] }, maria);
        const r = await useCase.update('people', template!.id, { name: 'Equipe' }, maria);
        expect(r.error).toBeUndefined();
        expect(r.template!.name).toBe('Equipe');
        expect(r.auditLabel).toBe('Pessoas: Equipe (antes equipe)');
    });

    it('409 com o nome de outro modelo ou de um modelo de fábrica', async () => {
        await useCase.create('people', { name: 'Um',
fields: ['name'] }, maria);
        const { template } = await useCase.create('people', { name: 'Dois',
fields: ['name'] }, maria);
        expect((await useCase.update('people', template!.id, { name: 'UM' }, maria)).error!.message).toBe(TEMPLATE_MESSAGES.nameTaken);
        expect((await useCase.update('people', template!.id, { name: 'Contato' }, maria)).error!.message).toBe(TEMPLATE_MESSAGES.factoryName);
    });

    it('400 sem nada para mudar; "confirmed" fora das inscrições não conta', async () => {
        const { template } = await useCase.create('people', { name: 'X',
fields: ['name'] }, maria);
        for (const body of [{}, { confirmed: true }, null]) {
            const r = await useCase.update('people', template!.id, body, maria);
            expect(r.error).toBeInstanceOf(ValidationError);
            expect(r.error!.message).toBe('Nada para alterar.');
        }
    });

    it('os campos novos passam pela mesma conferência de salvar', async () => {
        const { template } = await useCase.create('registrations', { name: 'X',
fields: ['name'] }, joana);
        expect((await useCase.update('registrations', template!.id, { fields: ['name', 'rg'] }, joana)).error!.message)
            .toBe('Sem permissão para exportar: RG.');
        expect((await useCase.update('registrations', template!.id, { fields: [] }, joana)).error!.message)
            .toBe('Escolha pelo menos um campo.');
        expect((await useCase.update('registrations', template!.id, { fields: null }, joana)).error!.message)
            .toBe('Escolha pelo menos um campo.');
        const ok = await useCase.update('registrations', template!.id, { confirmed: true }, joana);
        expect(ok.template!.confirmed).toBe(true);
    });

    it('403 para quem não pode exportar algum campo do modelo como ele está, mesmo só para renomear', async () => {
        const { template } = await useCase.create('registrations', { name: 'Ficha',
fields: ['name', 'rg'] }, maria);
        const r = await useCase.update('registrations', template!.id, { name: 'Outro nome' }, joana);
        expect(r.error).toBeInstanceOf(ForbiddenError);
        expect(r.error!.message).toBe('Este modelo tem campos que você não pode exportar: RG.');
        // Nem tirando o campo que não pode.
        expect((await useCase.update('registrations', template!.id, { fields: ['name'] }, joana)).error)
            .toBeInstanceOf(ForbiddenError);
        expect(mem.rows[0]).toMatchObject({ name: 'Ficha',
fields: ['name', 'rg'] });
    });

    it('404 para modelo inexistente, de outro relatório ou excluído', async () => {
        const { template } = await useCase.create('people', { name: 'X',
fields: ['name'] }, maria);
        expect((await useCase.update('people', randomUUID(), { name: 'Y' }, maria)).error!.message).toBe('Modelo não encontrado.');
        expect((await useCase.update('companies', template!.id, { name: 'Y' }, maria)).error).toBeInstanceOf(NotFoundError);
        await useCase.remove('people', template!.id, maria);
        expect((await useCase.update('people', template!.id, { name: 'Y' }, maria)).error).toBeInstanceOf(NotFoundError);
    });
});

describe('excluir', () => {
    it('soft-delete: some da lista, guarda quem excluiu e libera o nome', async () => {
        const { template } = await useCase.create('people', { name: 'Temporário',
fields: ['name'] }, maria);
        const r = await useCase.remove('people', template!.id, joana);
        expect(r.error).toBeUndefined();
        expect(r.auditLabel).toBe('Pessoas: Temporário');
        expect(mem.rows[0]).toMatchObject({ isDeleted: true,
updatedById: 'admin-joana' });
        expect(mem.rows[0].deletedAt).toBeInstanceOf(Date);
        expect((await useCase.list('people')).templates).toEqual([]);
        expect((await useCase.remove('people', template!.id, joana)).error!.message).toBe('Modelo não encontrado.');
        expect((await useCase.create('people', { name: 'temporário',
fields: ['cpf'] }, maria)).error).toBeUndefined();
    });

    it('403 para quem não pode exportar algum campo do modelo', async () => {
        const { template } = await useCase.create('registrations', { name: 'Ficha',
fields: ['name', 'rg'] }, maria);
        const r = await useCase.remove('registrations', template!.id, joana);
        expect(r.error).toBeInstanceOf(ForbiddenError);
        expect(mem.rows[0].isDeleted).toBe(false);
    });

    it('campo que saiu do catálogo não prende o modelo', async () => {
        const row = await mem.repo.create({ dataset: 'registrations',
name: 'Velho',
fields: ['name', 'campoQueSaiu'],
format: null,
confirmed: false,
createdById: 'x' });
        expect((await useCase.remove('registrations', row.id, joana)).error).toBeUndefined();
    });
});

describe('o que mudou, para a auditoria', () => {
    it('campos pelo rótulo (a chave, se saiu do catálogo), formato pelo nome', () => {
        expect(reportTemplateAuditSnapshot({ dataset: 'people',
name: 'Contato',
fields: ['name', 'cpf', 'campoQueSaiu'],
format: 'xlsx',
confirmed: null }))
            .toEqual({ name: 'Contato',
fields: 'Nome, CPF, campoQueSaiu',
format: 'Excel' });
        expect(reportTemplateAuditSnapshot({ dataset: 'registrations',
name: 'Presença',
fields: ['ordinal', 'name'],
format: null,
confirmed: true }))
            .toEqual({ name: 'Presença',
fields: 'Nº de ordem, Nome',
format: null,
onlyConfirmed: true });
    });
});
