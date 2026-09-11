export class AuthError extends Error {}

export class ForbiddenError extends Error {
    constructor(message = 'Sem permissão para esta ação.') {
        super(message);
        this.name = 'ForbiddenError';
    }
}

export class InvalidCredentialsError extends AuthError {
    constructor() {
        super('Invalid username or password');
        this.name = 'InvalidCredentialsError';
    }
}
