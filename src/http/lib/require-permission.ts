import { NotFoundError } from '../../errors/not-found.js';
import { ConflictError } from '../../errors/conflict.js';
import { AuthError, ForbiddenError } from '../../errors/auth.js';
import { BusinessRuleError } from '../../errors/business-rule.js';
import { TooManyAttemptsError } from '../../errors/too-many-attempts.js';

export function errorToStatus(err: Error | undefined): number {
    if (!err) return 400;
    if (err instanceof NotFoundError) return 404;
    if (err instanceof ConflictError) return 409;
    if (err instanceof BusinessRuleError) return 409;
    if (err instanceof ForbiddenError) return 403;
    if (err instanceof AuthError) return 401;
    if (err instanceof TooManyAttemptsError) return 429;
    return 400;
}
