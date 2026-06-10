export class ConflictError extends Error {}

export class UserAlreadyExistsError extends ConflictError {
    constructor() {
        super('User already exists');
        this.name = 'UserAlreadyExistsError';
    }
}

export class EmailOrCpfAlreadyInUseError extends ConflictError {
    constructor() {
        super('Email or CPF already in use');
        this.name = 'EmailOrCpfAlreadyInUseError';
    }
}

export class UsernameAlreadyExistsError extends ConflictError {
    constructor() {
        super('Username already exists');
        this.name = 'UsernameAlreadyExistsError';
    }
}

export class UsernameAlreadyInUseError extends ConflictError {
    constructor() {
        super('Username already in use');
        this.name = 'UsernameAlreadyInUseError';
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
