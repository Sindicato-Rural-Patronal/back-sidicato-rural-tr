export class ConflictError extends Error {}

// O CPF é a identidade da pessoa: é o único dado de cadastro que não pode repetir
// (e-mail e telefone podem ser do casal, da família).
export class CpfAlreadyInUseError extends ConflictError {
    constructor() {
        super('CPF já cadastrado para outra pessoa.');
        this.name = 'CpfAlreadyInUseError';
    }
}

export class RuleInUseError extends ConflictError {
    constructor() {
        super('Regra em uso por um ou mais administradores — não pode ser removida.');
        this.name = 'RuleInUseError';
    }
}

export class RoomNameAlreadyExistsError extends ConflictError {
    constructor() {
        super('Essa sala já está cadastrada.');
        this.name = 'RoomNameAlreadyExistsError';
    }
}

export class RoomHasCoursesError extends ConflictError {
    constructor() {
        super('Sala vinculada a cursos e não pode ser removida.');
        this.name = 'RoomHasCoursesError';
    }
}

export class RoomHasBookingsError extends ConflictError {
    constructor() {
        super('Sala com reservas (eventos ou reuniões) marcadas e não pode ser removida.');
        this.name = 'RoomHasBookingsError';
    }
}

export class RgAlreadyInUseError extends ConflictError {
    constructor() {
        super('RG already in use');
        this.name = 'RgAlreadyInUseError';
    }
}

export class UsernameAlreadyExistsError extends ConflictError {
    constructor() {
        super('Username already exists');
        this.name = 'UsernameAlreadyExistsError';
    }
}

export class AdminAccountAlreadyExistsError extends ConflictError {
    constructor() {
        super('This user already has an admin account');
        this.name = 'AdminAccountAlreadyExistsError';
    }
}

export class CourseRegistrationAlreadyExistsError extends ConflictError {
    constructor() {
        super('User already registered for this course');
        this.name = 'CourseRegistrationAlreadyExistsError';
    }
}

export class InstructorAlreadyExistsError extends ConflictError {
    constructor() {
        super('User is already an instructor');
        this.name = 'InstructorAlreadyExistsError';
    }
}

export class InstructorAlreadyAssignedError extends ConflictError {
    constructor() {
        super('Instructor already assigned to this course');
        this.name = 'InstructorAlreadyAssignedError';
    }
}

export class UnimedBeneficiarioAlreadyExistsError extends ConflictError {
    constructor() {
        super('Este usuário já possui cadastro de beneficiário Unimed.');
        this.name = 'UnimedBeneficiarioAlreadyExistsError';
    }
}

export class ConvenioSlugAlreadyExistsError extends ConflictError {
    constructor() {
        super('Já existe um convênio com este endereço de página.');
        this.name = 'ConvenioSlugAlreadyExistsError';
    }
}

export class CompanyCnpjAlreadyExistsError extends ConflictError {
    constructor() {
        super('Já existe uma empresa ativa com este CNPJ.');
        this.name = 'CompanyCnpjAlreadyExistsError';
    }
}

export class PublicContactAlreadyExistsError extends ConflictError {
    constructor() {
        super('Esta pessoa já é um contato público.');
        this.name = 'PublicContactAlreadyExistsError';
    }
}

export class CompanyMemberAlreadyExistsError extends ConflictError {
    constructor() {
        super('Esta pessoa já está vinculada a esta empresa. Edite o título no vínculo existente.');
        this.name = 'CompanyMemberAlreadyExistsError';
    }
}
