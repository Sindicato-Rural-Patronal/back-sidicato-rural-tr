export class BusinessRuleError extends Error {}

export class RoomAlreadyBookedError extends BusinessRuleError {
    constructor() {
        super('Room is already booked for this period');
        this.name = 'RoomAlreadyBookedError';
    }
}

export class RegistrationsUnavailableError extends BusinessRuleError {
    constructor() {
        super('Registrations unavailable for this course');
        this.name = 'RegistrationsUnavailableError';
    }
}
