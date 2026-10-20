export class BusinessRuleError extends Error {}

// A mensagem diz o que ocupa a sala (usecase/room-availability.ts, conflictMessage).
export class RoomAlreadyBookedError extends BusinessRuleError {
    constructor(message = 'Room is already booked for this period') {
        super(message);
        this.name = 'RoomAlreadyBookedError';
    }
}

export class RegistrationsUnavailableError extends BusinessRuleError {
    constructor() {
        super('Inscrições indisponíveis para este curso.');
        this.name = 'RegistrationsUnavailableError';
    }
}

export class RegistrationDeadlinePassedError extends BusinessRuleError {
    constructor() {
        super('Prazo de inscrição encerrado.');
        this.name = 'RegistrationDeadlinePassedError';
    }
}

export class CourseFullError extends BusinessRuleError {
    constructor() {
        super('Curso lotado — sem vagas disponíveis.');
        this.name = 'CourseFullError';
    }
}

// Inscrição completa com CPF que já tem cadastro e telefone que não confere:
// nada é vinculado nem alterado (SR-025).
export class IdentityNotConfirmedError extends BusinessRuleError {
    constructor() {
        super('Não foi possível confirmar seu cadastro pelo site. Procure o Sindicato para fazer a inscrição.');
        this.name = 'IdentityNotConfirmedError';
    }
}
