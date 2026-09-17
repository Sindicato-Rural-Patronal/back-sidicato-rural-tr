import type { UserListFilters } from './user-data-repository.js';
import type { CompanyListFilters } from './company-repository.js';
import type { CourseListFilters } from './course-repository.js';
import type { UserAdminListFilters } from './user-admin-repository.js';
import type { ContactMessageFilters } from './contact-message-repository.js';

// Exportação de dados do painel. Cada método aceita os filtros da listagem
// correspondente OU uma lista de ids (seleção / um registro só). Sem paginação.

/** Filtros da trilha de auditoria (mesmos da tela Auditoria). */
export type AuditLogFilters = {
    action?: 'create' | 'edit' | 'delete' | 'export';
    entity?: string;
    actorId?: string;
    from?: string;
    to?: string;
    q?: string;
};

/** Quando `ids` vem preenchido, os filtros são ignorados. */
export type ExportSelection = { ids?: string[] };

export type ExportAddress = {
    type: string;
    street: string | null;
    number: string | null;
    complement: string | null;
    neighborhood: string | null;
    localityName: string | null;
    road: string | null;
    km: string | null;
    lot: string | null;
    section: string | null;
    city: string | null;
    state: string | null;
    zipCode: string | null;
    notes: string | null;
};

export type ExportProperty = {
    id: string;
    name: string;
    registration: string | null;
    address: ExportAddress | null;
};

export type PersonExportRow = {
    id: string;
    name: string;
    nickname: string | null;
    cpf: string | null;
    rg: string | null;
    rgIssuer: string | null;
    rgIssuedAt: Date | null;
    birthDate: Date | null;
    gender: string | null;
    maritalStatus: string | null;
    nationality: string | null;
    birthPlace: string | null;
    ethnicity: string | null;
    educationLevel: string | null;
    specialNeeds: boolean;
    driverLicense: string | null;
    driverLicenseCategory: string | null;
    email: string;
    phone: string;
    phone2: string | null;
    phone3: string | null;
    memberType: string | null;
    memberClassification: string | null;
    functionalCategory: string | null;
    familyIncome: string | null;
    cadPro: string[];
    memberStatus: string | null;
    memberSince: Date | null;
    membershipValidUntil: Date | null;
    memberNotesNumber: string | null;
    memberNotes: string | null;
    boardMember: boolean;
    boardPosition: string | null;
    primaryPropertyId: string | null;
    createdAt: Date;
    updatedAt: Date;
    properties: ExportProperty[];
    companyMemberships: {
 title: string;
company: {
 name: string;
tradeName: string | null 
} 
}[];
    relations: {
 label: string | null;
target: { name: string } 
}[];
    userAdmin: {
 username: string;
isDeleted: boolean 
} | null;
    userInstructor: { id: string } | null;
    unimed: {
 plano: string | null;
isDeleted: boolean 
} | null;
    publicContact: { title: string | null } | null;
    _count: { courseUserRegistration: number };
};

export type CompanyExportRow = {
    id: string;
    name: string;
    tradeName: string | null;
    cnpj: string | null;
    stateRegistration: string | null;
    type: string;
    email: string | null;
    phone: string | null;
    phone2: string | null;
    phone3: string | null;
    website: string | null;
    notes: string | null;
    isPartner: boolean;
    partnerUrl: string | null;
    createdAt: Date;
    updatedAt: Date;
    address: ExportAddress | null;
    members: {
 title: string;
userData: {
 name: string;
cpf: string | null 
} 
}[];
    properties: ExportProperty[];
};

export type PropertyExportRow = ExportProperty & {
    createdAt: Date;
    userData: {
 name: string;
cpf: string | null;
primaryPropertyId: string | null 
} | null;
    company: {
 name: string;
tradeName: string | null;
cnpj: string | null;
primaryPropertyId: string | null 
} | null;
};

export type AdminExportRow = {
    id: string;
    username: string;
    createdAt: Date;
    userData: {
 name: string;
email: string;
cpf: string | null;
phone: string 
};
    rules: { name: string };
};

export type CourseExportRow = {
    id: string;
    name: string;
    description: string;
    eventNumber: string | null;
    status: string;
    startTime: Date;
    endTime: Date;
    registrationDeadline: Date | null;
    workloadHours: number;
    price: number;
    minStudents: number;
    preEnrolled: number;
    waitlist: number;
    observations: string | null;
    createdAt: Date;
    room: {
 name: string;
maxCapacity: number 
};
    instructors: {
 title: string | null;
instructor: { userData: { name: string } } 
}[];
    courseUserRegistration: { confirmed: boolean }[];
};

export type RegistrationExportRow = {
    id: string;
    confirmed: boolean;
    createdAt: Date;
    ficha: { id: string } | null;
    course: {
 name: string;
eventNumber: string | null;
startTime: Date 
};
    userData: {
        name: string;
        cpf: string | null;
        email: string;
        phone: string;
        birthDate: Date | null;
        memberStatus: string | null;
        membershipValidUntil: Date | null;
        boardPosition: string | null;
        companyMemberships: {
 company: {
 name: string;
tradeName: string | null 
} 
}[];
    };
};

export type ContactMessageExportRow = {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    subject: string | null;
    message: string;
    read: boolean;
    createdAt: Date;
};

export type UnimedExportRow = {
    id: string;
    dataAdesao: Date | null;
    tipoMovimento: string | null;
    tipoDependente: string | null;
    grauDependencia: string | null;
    cns: string | null;
    nomeMae: string | null;
    profissao: string | null;
    plano: string | null;
    matricula: string | null;
    empresa: string | null;
    contratante: string | null;
    motivo: string | null;
    obs: string | null;
    createdAt: Date;
    titularName: string | null;
    userData: {
 name: string;
cpf: string | null;
birthDate: Date | null;
phone: string;
email: string 
};
};

export type AuditLogExportRow = {
    id: string;
    method: string;
    path: string;
    entity: string;
    targetLabel: string | null;
    createdAt: Date;
    actorName: string;
};

export interface ExportRepository {
    people(filters: UserListFilters & ExportSelection): Promise<PersonExportRow[]>;
    companies(filters: CompanyListFilters & ExportSelection): Promise<CompanyExportRow[]>;
    /** `ownerIds`: propriedades dessas pessoas/empresas. */
    properties(filters: ExportSelection & { ownerIds?: string[] }): Promise<PropertyExportRow[]>;
    admins(filters: UserAdminListFilters & ExportSelection): Promise<AdminExportRow[]>;
    courses(filters: CourseListFilters & ExportSelection): Promise<CourseExportRow[]>;
    /** `courseIds`: inscrições desses cursos; sem nada, de todos. */
    registrations(filters: ExportSelection & { courseIds?: string[] }): Promise<RegistrationExportRow[]>;
    contactMessages(filters: ContactMessageFilters & ExportSelection): Promise<ContactMessageExportRow[]>;
    unimed(filters: { search?: string } & ExportSelection): Promise<UnimedExportRow[]>;
    auditLogs(filters: AuditLogFilters): Promise<AuditLogExportRow[]>;
    /** Registra a exportação na trilha de auditoria. */
    logExport(entry: {
 actorId: string;
path: string;
targetLabel: string 
}): Promise<void>;
}
