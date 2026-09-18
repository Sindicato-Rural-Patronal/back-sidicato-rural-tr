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
        super('Registrations unavailable for this course');
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
