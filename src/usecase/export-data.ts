import { z } from 'zod';
import type { Permission } from '../generated/prisma/enums.js';
import type {
    AdminExportRow,
    AuditLogExportRow,
    AuditLogFilters,
    CompanyExportRow,
    ContactMessageExportRow,
    CourseExportRow,
    ExportAddress,
    ExportProperty,
    ExportRepository,
    PersonExportRow,
    PropertyExportRow,
    RegistrationExportRow,
    UnimedExportRow,
} from '../ports/external/export-repository.js';
import { ValidationError } from '../errors/validation.js';
import { csvDate, csvDateTime, csvList, csvMoney, toCsv, type CsvColumn } from '../lib/csv.js';
import {
    ADDRESS_TYPE_LABEL,
    AUDIT_METHOD_LABEL,
    COMPANY_TYPE_LABEL,
    COURSE_STATUS_LABEL,
    EDUCATION_LABEL,
    ETHNICITY_LABEL,
    GENDER_LABEL,
    MARITAL_STATUS_LABEL,
    MEMBER_STATUS_LABEL,
    label,
} from '../lib/export-labels.js';
import { todayInBrazil } from '../lib/quote-products.js';


// ── Conjuntos exportáveis ────────────────────────────────────────────────────

export const EXPORT_DATASETS = {
    people: { permission: 'READ_USER',
title: 'Pessoas',
file: 'pessoas',
single: 'pessoa' },
    companies: { permission: 'READ_USER',
title: 'Empresas',
file: 'empresas',
single: 'empresa' },
    properties: { permission: 'READ_USER',
title: 'Propriedades',
file: 'propriedades',
single: 'propriedade' },
    admins: { permission: 'READ_USER_ADMIN',
title: 'Administradores',
file: 'administradores',
single: 'administrador' },
    courses: { permission: 'READ_COURSE',
title: 'Cursos',
file: 'cursos',
single: 'curso' },
    registrations: { permission: 'READ_COURSE',
title: 'Inscrições',
file: 'inscricoes',
single: 'inscricao' },
    'contact-messages': { permission: 'READ_CONTACT',
title: 'Mensagens de contato',
file: 'mensagens',
single: 'mensagem' },
    unimed: { permission: 'READ_USER',
title: 'Beneficiários Unimed',
file: 'unimed',
single: 'unimed' },
    'audit-logs': { permission: 'READ_AUDIT',
title: 'Auditoria',
file: 'auditoria',
single: 'auditoria' },
} as const satisfies Record<string, {
 permission: Permission;
title: string;
file: string;
single: string 
}>;

export type ExportDataset = keyof typeof EXPORT_DATASETS;

export type ExportResult = {
    csv: string;
    count: number;
    filename: string;
    /** Texto para a trilha de auditoria. */
    auditLabel: string;
};

// ── Leitura da query ─────────────────────────────────────────────────────────

const empty = (v: unknown) => (v === '' || v == null ? undefined : v);
const text = z.preprocess(empty, z.string().trim().max(200).optional());
const bool = z.preprocess(v => (v === 'true' ? true : v === 'false' ? false : undefined), z.boolean().optional());
// "a,b,c" → ['a','b','c']
const idList = z.preprocess(
    v => (typeof v === 'string' && v.trim() ? v.split(',').map(s => s.trim()).filter(Boolean) : undefined),
    z.array(z.string().max(64)).max(5000, 'Selecione no máximo 5000 registros').optional(),
);

const schemas = {
    people: z.object({
        ids: idList,
        search: text,
        memberType: text,
        memberClassification: text,
        gender: text,
        ethnicity: text,
        educationLevel: text,
        incompleteRegistration: bool,
    }),
    companies: z.object({
        ids: idList,
        search: text,
        type: z.preprocess(empty, z.enum(['PRIVATE', 'PUBLIC']).optional()),
        isPartner: bool,
    }),
    properties: z.object({ ids: idList,
ownerIds: idList }),
    admins: z.object({ ids: idList,
search: text,
rulesId: text }),
    courses: z.object({
        ids: idList,
        search: text,
        status: z.preprocess(empty, z.enum(['PUBLIC', 'PRIVATE', 'UNPUBLISHED', 'IN_PROGRESS']).optional()),
    }),
    registrations: z.object({ ids: idList,
courseIds: idList }),
    'contact-messages': z.object({ ids: idList,
search: text,
read: bool }),
    unimed: z.object({ ids: idList,
search: text }),
    'audit-logs': z.object({
        action: z.preprocess(empty, z.enum(['create', 'edit', 'delete', 'export']).optional()),
        entity: text,
        actorId: text,
        from: text,
        to: text,
        q: text,
    }),
} satisfies Record<ExportDataset, z.ZodTypeAny>;

// ── Formatação ───────────────────────────────────────────────────────────────

function formatCpf(cpf: string | null): string {
    if (!cpf) return '';
    const d = cpf.replace(/\D/g, '');
    return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : cpf;
}

function formatCnpj(cnpj: string | null): string {
    if (!cnpj) return '';
    const d = cnpj.replace(/\D/g, '');
    return d.length === 14 ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}` : cnpj;
}

function formatCep(cep: string | null): string {
    if (!cep) return '';
    const d = cep.replace(/\D/g, '');
    return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : cep;
}

/** Endereço numa linha: "Rua X, 10 - Centro - Terra Roxa/PR - 85990-000". */
function addressLine(a: ExportAddress | null): string {
    if (!a) return '';
    const street = [a.street ?? a.road, a.number].filter(Boolean).join(', ');
    const rural = [a.localityName, a.km && `km ${a.km}`, a.lot && `lote ${a.lot}`, a.section && `seção ${a.section}`]
        .filter(Boolean)
        .join(', ');
    const city = [a.city, a.state].filter(Boolean).join('/');
    return [street, a.complement, a.neighborhood, rural, city, formatCep(a.zipCode)].filter(Boolean).join(' - ');
}

function propertyLine(p: ExportProperty): string {
    const name = p.registration ? `${p.name} (matrícula ${p.registration})` : p.name;
    const where = addressLine(p.address);
    return where ? `${name}: ${where}` : name;
}

/** Colunas de endereço separadas (planilha filtrável por cidade, CEP…). */
function addressColumns<T>(prefix: string, get: (row: T) => ExportAddress | null | undefined): CsvColumn<T>[] {
    const col = (header: string, pick: (a: ExportAddress) => string | null): CsvColumn<T> => ({
        header: `${prefix}${header}`,
        value: row => {
            const a = get(row);
            return a ? pick(a) : '';
        },
    });
    return [
        col('Tipo', a => label(ADDRESS_TYPE_LABEL, a.type)),
        col('Rua', a => a.street),
        col('Número', a => a.number),
        col('Complemento', a => a.complement),
        col('Bairro', a => a.neighborhood),
        col('Localidade', a => a.localityName),
        col('Estrada', a => a.road),
        col('Km', a => a.km),
        col('Lote', a => a.lot),
        col('Seção', a => a.section),
        col('Cidade', a => a.city),
        col('UF', a => a.state),
        col('CEP', a => formatCep(a.zipCode)),
    ];
}

function ymd(d: Date): string {
    return d.toISOString().slice(0, 10);
}

function isActiveMember(status: string | null, validUntil: Date | null, today: Date): boolean {
    if (status !== 'ACTIVE') return false;
    return !validUntil || ymd(validUntil) >= ymd(today);
}

function slug(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 50);
}

// ── Colunas de cada conjunto ─────────────────────────────────────────────────

function primaryProperty(p: PersonExportRow): ExportProperty | undefined {
    return p.properties.find(x => x.id === p.primaryPropertyId) ?? p.properties[0];
}

function peopleColumns(today: Date): CsvColumn<PersonExportRow>[] {
    return [
        { header: 'Nome',
value: p => p.name },
        { header: 'Apelido',
value: p => p.nickname },
        { header: 'CPF',
value: p => formatCpf(p.cpf) },
        { header: 'RG',
value: p => p.rg },
        { header: 'Órgão emissor',
value: p => p.rgIssuer },
        { header: 'Emissão do RG',
value: p => csvDate(p.rgIssuedAt) },
        { header: 'Nascimento',
value: p => csvDate(p.birthDate) },
        { header: 'Sexo',
value: p => label(GENDER_LABEL, p.gender) },
        { header: 'Estado civil',
value: p => label(MARITAL_STATUS_LABEL, p.maritalStatus) },
        { header: 'Nacionalidade',
value: p => p.nationality },
        { header: 'Naturalidade',
value: p => p.birthPlace },
        { header: 'Etnia',
value: p => label(ETHNICITY_LABEL, p.ethnicity) },
        { header: 'Escolaridade',
value: p => label(EDUCATION_LABEL, p.educationLevel) },
        { header: 'Necessidades especiais',
value: p => p.specialNeeds },
        { header: 'CNH',
value: p => p.driverLicense },
        { header: 'Categoria CNH',
value: p => p.driverLicenseCategory },
        { header: 'E-mail',
value: p => p.email },
        { header: 'Telefone',
value: p => p.phone },
        { header: 'Telefone 2',
value: p => p.phone2 },
        { header: 'Telefone 3',
value: p => p.phone3 },
        { header: 'Tipo de membro',
value: p => p.memberType },
        { header: 'Classificação',
value: p => p.memberClassification },
        { header: 'Categoria funcional',
value: p => p.functionalCategory },
        { header: 'Renda familiar',
value: p => p.familyIncome },
        { header: 'CAD/PRO',
value: p => csvList(p.cadPro) },
        { header: 'Situação de associado',
value: p => label(MEMBER_STATUS_LABEL, p.memberStatus) },
        { header: 'Associado em dia',
value: p => isActiveMember(p.memberStatus, p.membershipValidUntil, today) },
        { header: 'Associado desde',
value: p => csvDate(p.memberSince) },
        { header: 'Associado até',
value: p => csvDate(p.membershipValidUntil) },
        { header: 'Nº da observação',
value: p => p.memberNotesNumber },
        { header: 'Observações',
value: p => p.memberNotes },
        { header: 'Diretoria',
value: p => p.boardMember },
        { header: 'Cargo na diretoria',
value: p => p.boardPosition },
        { header: 'Propriedade principal',
value: p => primaryProperty(p)?.name },
        ...addressColumns<PersonExportRow>('Endereço: ', p => primaryProperty(p)?.address),
        { header: 'Todas as propriedades',
value: p => csvList(p.properties.map(propertyLine)) },
        {
            header: 'Empresas vinculadas',
            value: p => csvList(p.companyMemberships.map(m => `${m.company.tradeName || m.company.name} (${m.title})`)),
        },
        {
            header: 'Relacionamentos',
            value: p => csvList(p.relations.map(r => (r.label ? `${r.target.name} (${r.label})` : r.target.name))),
        },
        { header: 'Instrutor',
value: p => !!p.userInstructor },
        { header: 'Usuário do painel',
value: p => (p.userAdmin && !p.userAdmin.isDeleted ? p.userAdmin.username : '') },
        { header: 'Unimed',
value: p => (p.unimed && !p.unimed.isDeleted ? p.unimed.plano || 'Sim' : '') },
        { header: 'Contato público',
value: p => (p.publicContact ? p.publicContact.title || 'Sim' : '') },
        { header: 'Inscrições em cursos',
value: p => p._count.courseUserRegistration },
        { header: 'Cadastrado em',
value: p => csvDateTime(p.createdAt) },
        { header: 'Atualizado em',
value: p => csvDateTime(p.updatedAt) },
    ];
}

const companyColumns: CsvColumn<CompanyExportRow>[] = [
    { header: 'Razão social',
value: c => c.name },
    { header: 'Nome fantasia',
value: c => c.tradeName },
    { header: 'CNPJ',
value: c => formatCnpj(c.cnpj) },
    { header: 'Inscrição estadual',
value: c => c.stateRegistration },
    { header: 'Tipo',
value: c => label(COMPANY_TYPE_LABEL, c.type) },
    { header: 'E-mail',
value: c => c.email },
    { header: 'Telefone',
value: c => c.phone },
    { header: 'Telefone 2',
value: c => c.phone2 },
    { header: 'Telefone 3',
value: c => c.phone3 },
    { header: 'Site',
value: c => c.website },
    ...addressColumns<CompanyExportRow>('Sede: ', c => c.address),
    {
        header: 'Pessoas vinculadas',
        value: c => csvList(c.members.map(m => `${m.userData.name} (${m.title})`)),
    },
    { header: 'Propriedades',
value: c => csvList(c.properties.map(propertyLine)) },
    { header: 'Parceira',
value: c => c.isPartner },
    { header: 'Link da parceria',
value: c => c.partnerUrl },
    { header: 'Observações',
value: c => c.notes },
    { header: 'Cadastrada em',
value: c => csvDateTime(c.createdAt) },
    { header: 'Atualizada em',
value: c => csvDateTime(c.updatedAt) },
];

const propertyColumns: CsvColumn<PropertyExportRow>[] = [
    { header: 'Propriedade',
value: p => p.name },
    { header: 'Matrícula',
value: p => p.registration },
    { header: 'Dono',
value: p => (p.userData ? 'Pessoa' : 'Empresa') },
    { header: 'Nome do dono',
value: p => p.userData?.name ?? (p.company ? p.company.tradeName || p.company.name : '') },
    { header: 'CPF/CNPJ',
value: p => (p.userData ? formatCpf(p.userData.cpf) : formatCnpj(p.company?.cnpj ?? null)) },
    {
        header: 'Principal',
        value: p => (p.userData ?? p.company)?.primaryPropertyId === p.id,
    },
    ...addressColumns<PropertyExportRow>('', p => p.address),
    { header: 'Observações do endereço',
value: p => p.address?.notes },
    { header: 'Cadastrada em',
value: p => csvDateTime(p.createdAt) },
];

const adminColumns: CsvColumn<AdminExportRow>[] = [
    { header: 'Usuário',
value: a => a.username },
    { header: 'Nome',
value: a => a.userData.name },
    { header: 'E-mail',
value: a => a.userData.email },
    { header: 'CPF',
value: a => formatCpf(a.userData.cpf) },
    { header: 'Telefone',
value: a => a.userData.phone },
    { header: 'Regra de acesso',
value: a => a.rules.name },
    { header: 'Criado em',
value: a => csvDateTime(a.createdAt) },
];

const courseColumns: CsvColumn<CourseExportRow>[] = [
    { header: 'Curso',
value: c => c.name },
    { header: 'Nº do evento',
value: c => c.eventNumber },
    { header: 'Status',
value: c => label(COURSE_STATUS_LABEL, c.status) },
    { header: 'Início',
value: c => csvDateTime(c.startTime) },
    { header: 'Término',
value: c => csvDateTime(c.endTime) },
    { header: 'Inscrições até',
value: c => csvDateTime(c.registrationDeadline) },
    { header: 'Sala',
value: c => c.room.name },
    { header: 'Capacidade da sala',
value: c => c.room.maxCapacity },
    {
        header: 'Instrutores',
        value: c => csvList(c.instructors.map(i => (i.title ? `${i.instructor.userData.name} (${i.title})` : i.instructor.userData.name))),
    },
    { header: 'Carga horária (h)',
value: c => c.workloadHours },
    { header: 'Valor (R$)',
value: c => csvMoney(c.price) },
    { header: 'Mínimo de alunos',
value: c => c.minStudents },
    { header: 'Inscritos',
value: c => c.courseUserRegistration.length },
    { header: 'Confirmados',
value: c => c.courseUserRegistration.filter(r => r.confirmed).length },
    { header: 'Pré-inscritos',
value: c => c.preEnrolled },
    { header: 'Lista de espera',
value: c => c.waitlist },
    { header: 'Descrição',
value: c => c.description },
    { header: 'Observações',
value: c => c.observations },
    { header: 'Criado em',
value: c => csvDateTime(c.createdAt) },
];

function registrationColumns(today: Date): CsvColumn<RegistrationExportRow>[] {
    return [
        { header: 'Curso',
value: r => r.course.name },
        { header: 'Nº do evento',
value: r => r.course.eventNumber },
        { header: 'Início do curso',
value: r => csvDateTime(r.course.startTime) },
        { header: 'Nome',
value: r => r.userData.name },
        { header: 'CPF',
value: r => formatCpf(r.userData.cpf) },
        { header: 'E-mail',
value: r => r.userData.email },
        { header: 'Telefone',
value: r => r.userData.phone },
        { header: 'Nascimento',
value: r => csvDate(r.userData.birthDate) },
        { header: 'Confirmada',
value: r => r.confirmed },
        { header: 'Associado em dia',
value: r => isActiveMember(r.userData.memberStatus, r.userData.membershipValidUntil, today) },
        {
            header: 'Empresa parceira',
            value: r => csvList(r.userData.companyMemberships.map(m => m.company.tradeName || m.company.name)),
        },
        { header: 'Cargo na diretoria',
value: r => r.userData.boardPosition },
        { header: 'Ficha anexada',
value: r => !!r.ficha },
        { header: 'Inscrito em',
value: r => csvDateTime(r.createdAt) },
    ];
}

const contactMessageColumns: CsvColumn<ContactMessageExportRow>[] = [
    { header: 'Recebida em',
value: m => csvDateTime(m.createdAt) },
    { header: 'Nome',
value: m => m.name },
    { header: 'E-mail',
value: m => m.email },
    { header: 'Telefone',
value: m => m.phone },
    { header: 'Assunto',
value: m => m.subject },
    { header: 'Mensagem',
value: m => m.message },
    { header: 'Lida',
value: m => m.read },
];

const unimedColumns: CsvColumn<UnimedExportRow>[] = [
    { header: 'Nome',
value: u => u.userData.name },
    { header: 'CPF',
value: u => formatCpf(u.userData.cpf) },
    { header: 'Nascimento',
value: u => csvDate(u.userData.birthDate) },
    { header: 'Telefone',
value: u => u.userData.phone },
    { header: 'E-mail',
value: u => u.userData.email },
    { header: 'Plano',
value: u => u.plano },
    { header: 'Matrícula',
value: u => u.matricula },
    { header: 'CNS',
value: u => u.cns },
    { header: 'Nome da mãe',
value: u => u.nomeMae },
    { header: 'Profissão',
value: u => u.profissao },
    { header: 'Empresa',
value: u => u.empresa },
    { header: 'Contratante',
value: u => u.contratante },
    { header: 'Tipo de movimento',
value: u => u.tipoMovimento },
    { header: 'Tipo de dependente',
value: u => u.tipoDependente },
    { header: 'Grau de dependência',
value: u => u.grauDependencia },
    { header: 'Titular',
value: u => u.titularName },
    { header: 'Data de adesão',
value: u => csvDate(u.dataAdesao) },
    { header: 'Motivo',
value: u => u.motivo },
    { header: 'Observações',
value: u => u.obs },
    { header: 'Cadastrado em',
value: u => csvDateTime(u.createdAt) },
];

const auditColumns: CsvColumn<AuditLogExportRow>[] = [
    { header: 'Data e hora',
value: a => csvDateTime(a.createdAt) },
    { header: 'Quem',
value: a => a.actorName },
    { header: 'Ação',
value: a => label(AUDIT_METHOD_LABEL, a.method) },
    { header: 'Área',
value: a => a.entity },
    { header: 'Alvo',
value: a => a.targetLabel },
    { header: 'Caminho',
value: a => a.path },
];

// ── Caso de uso ──────────────────────────────────────────────────────────────

// Planilha CSV de um conjunto de dados: com `ids` exporta só os selecionados
// (um ou vários); sem, tudo o que bate com os filtros da listagem.
export class ExportDataUseCase {
    constructor(
        private readonly repo: ExportRepository,
        private readonly now: () => Date = () => new Date(),
    ) {}

    async execute(dataset: ExportDataset, query: unknown): Promise<{
 error?: Error;
result?: ExportResult 
}> {
        const parsed = schemas[dataset].safeParse(query ?? {});
        if (!parsed.success) {
            return { error: new ValidationError(parsed.error.issues[0]?.message ?? 'Filtro inválido') };
        }
        const q = parsed.data as Record<string, unknown> & { ids?: string[] };
        const today = todayInBrazil(this.now());

        const built = await this.build(dataset, q, today);
        const meta = EXPORT_DATASETS[dataset];
        const date = ymd(today);
        const single = built.count === 1 && q.ids?.length === 1 && built.firstName;
        const filename = single
            ? `${meta.single}-${slug(built.firstName!) || 'registro'}-${date}.csv`
            : `${meta.file}-${date}.csv`;
        const scope = q.ids?.length ? 'seleção' : Object.values(q).some(v => v !== undefined) ? 'com filtros' : 'todos';
        const auditLabel = single
            ? `${meta.title}: ${built.firstName}`
            : `${meta.title}: ${built.count} registro${built.count === 1 ? '' : 's'} (${scope})`;
        return { result: { csv: built.csv,
count: built.count,
filename,
auditLabel } };
    }

    private async build(
        dataset: ExportDataset,
        q: Record<string, unknown> & { ids?: string[] },
        today: Date,
    ): Promise<{
 csv: string;
count: number;
firstName?: string 
}> {
        switch (dataset) {
            case 'people': {
                const rows = await this.repo.people(q);
                return { csv: toCsv(peopleColumns(today), rows),
count: rows.length,
firstName: rows[0]?.name };
            }
            case 'companies': {
                const rows = await this.repo.companies(q);
                return { csv: toCsv(companyColumns, rows),
count: rows.length,
firstName: rows[0] && (rows[0].tradeName || rows[0].name) };
            }
            case 'properties': {
                const rows = await this.repo.properties(q as {
 ids?: string[];
ownerIds?: string[] 
});
                return { csv: toCsv(propertyColumns, rows),
count: rows.length,
firstName: rows[0]?.name };
            }
            case 'admins': {
                const rows = await this.repo.admins(q);
                return { csv: toCsv(adminColumns, rows),
count: rows.length,
firstName: rows[0]?.userData.name };
            }
            case 'courses': {
                const rows = await this.repo.courses(q);
                return { csv: toCsv(courseColumns, rows),
count: rows.length,
firstName: rows[0]?.name };
            }
            case 'registrations': {
                const rows = await this.repo.registrations(q as {
 ids?: string[];
courseIds?: string[] 
});
                return { csv: toCsv(registrationColumns(today), rows),
count: rows.length,
firstName: rows[0]?.userData.name };
            }
            case 'contact-messages': {
                const rows = await this.repo.contactMessages(q);
                return { csv: toCsv(contactMessageColumns, rows),
count: rows.length,
firstName: rows[0]?.name };
            }
            case 'unimed': {
                const rows = await this.repo.unimed(q);
                return { csv: toCsv(unimedColumns, rows),
count: rows.length,
firstName: rows[0]?.userData.name };
            }
            case 'audit-logs': {
                const rows = await this.repo.auditLogs(q as AuditLogFilters);
                return { csv: toCsv(auditColumns, rows),
count: rows.length };
            }
        }
    }
}
