export class AuthError extends Error {}

export class InvalidCredentialsError extends AuthError {
    constructor() {
        super('Invalid username or password');
        this.name = 'InvalidCredentialsError';
    }
}
