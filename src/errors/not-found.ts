export class NotFoundError extends Error {}

export class CourseNotFoundError extends NotFoundError {
    constructor() {
        super('Course not found');
        this.name = 'CourseNotFoundError';
    }
}

export class UserNotFoundError extends NotFoundError {
    constructor() {
        super('User not found');
        this.name = 'UserNotFoundError';
    }
}

export class UserDataNotFoundError extends NotFoundError {
    constructor() {
        super('Invalid userDataId: user not found');
        this.name = 'UserDataNotFoundError';
    }
}

export class AdminNotFoundError extends NotFoundError {
    constructor() {
        super('Admin not found');
        this.name = 'AdminNotFoundError';
    }
}

export class NewsNotFoundError extends NotFoundError {
    constructor() {
        super('News not found');
        this.name = 'NewsNotFoundError';
    }
}

export class RoomNotFoundError extends NotFoundError {
    constructor() {
        super('Room not found');
        this.name = 'RoomNotFoundError';
    }
}

export class RuleNotFoundError extends NotFoundError {
    constructor() {
        super('Rule not found');
        this.name = 'RuleNotFoundError';
    }
}

export class RoleNotFoundError extends NotFoundError {
    constructor() {
        super('Invalid role: permission rule not found');
        this.name = 'RoleNotFoundError';
    }
}

export class PermissionRuleNotFoundError extends NotFoundError {
    constructor() {
        super('Permission rule not found');
        this.name = 'PermissionRuleNotFoundError';
    }
}

export class RegistrationNotFoundError extends NotFoundError {
    constructor() {
        super('Registration not found');
        this.name = 'RegistrationNotFoundError';
    }
}

export class PhotoNotFoundError extends NotFoundError {
    constructor() {
        super('Photo not found');
        this.name = 'PhotoNotFoundError';
    }
}

export class UserRelationNotFoundError extends NotFoundError {
    constructor() {
        super('User relation not found');
        this.name = 'UserRelationNotFoundError';
    }
}

export class PropertyNotFoundError extends NotFoundError {
    constructor() {
        super('Property not found');
        this.name = 'PropertyNotFoundError';
    }
}

export class AddressNotFoundError extends NotFoundError {
    constructor() {
        super('CEP not found');
        this.name = 'AddressNotFoundError';
    }
}

export class InstructorNotFoundError extends NotFoundError {
    constructor() {
        super('Instructor not found');
        this.name = 'InstructorNotFoundError';
    }
}

export class ContactMessageNotFoundError extends NotFoundError {
    constructor() {
        super('Contact message not found');
        this.name = 'ContactMessageNotFoundError';
    }
}

export class BannerNotFoundError extends NotFoundError {
    constructor() {
        super('Banner not found');
        this.name = 'BannerNotFoundError';
    }
}

export class MarketQuoteNotFoundError extends NotFoundError {
    constructor() {
        super('Cotação não encontrada');
        this.name = 'MarketQuoteNotFoundError';
    }
}

export class AdminInviteInvalidError extends NotFoundError {
    constructor() {
        super('Convite inválido, expirado ou já utilizado.');
        this.name = 'AdminInviteInvalidError';
    }
}

export class FinanceCategoryNotFoundError extends NotFoundError {
    constructor() {
        super('Categoria financeira não encontrada');
        this.name = 'FinanceCategoryNotFoundError';
    }
}

export class FinanceTransactionNotFoundError extends NotFoundError {
    constructor() {
        super('Lançamento não encontrado');
        this.name = 'FinanceTransactionNotFoundError';
    }
}

export class UnimedBeneficiarioNotFoundError extends NotFoundError {
    constructor() {
        super('Beneficiário Unimed não encontrado');
        this.name = 'UnimedBeneficiarioNotFoundError';
    }
}

export class GalleryAlbumNotFoundError extends NotFoundError {
    constructor() {
        super('Galeria não encontrada');
        this.name = 'GalleryAlbumNotFoundError';
    }
}

export class GalleryPhotoNotFoundError extends NotFoundError {
    constructor() {
        super('Foto não encontrada');
        this.name = 'GalleryPhotoNotFoundError';
    }
}

export class ConvenioNotFoundError extends NotFoundError {
    constructor() {
        super('Convênio não encontrado');
        this.name = 'ConvenioNotFoundError';
    }
}

export class CompanyNotFoundError extends NotFoundError {
    constructor() {
        super('Empresa não encontrada');
        this.name = 'CompanyNotFoundError';
    }
}

export class PublicContactNotFoundError extends NotFoundError {
    constructor() {
        super('Contato público não encontrado');
        this.name = 'PublicContactNotFoundError';
    }
}

export class CompanyMemberNotFoundError extends NotFoundError {
    constructor() {
        super('Vínculo com a empresa não encontrado');
        this.name = 'CompanyMemberNotFoundError';
    }
}
