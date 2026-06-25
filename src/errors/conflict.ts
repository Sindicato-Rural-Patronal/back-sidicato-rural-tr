export class ConflictError extends Error {}

export class UserAlreadyExistsError extends ConflictError {
    constructor() {
        super('User already exists');
        this.name = 'UserAlreadyExistsError';
    }
}

export class EmailOrCpfAlreadyInUseError extends ConflictError {
    constructor() {
        super('CPF already in use');
        this.name = 'EmailOrCpfAlreadyInUseError';
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
