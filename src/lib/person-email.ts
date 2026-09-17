import { z } from 'zod';

/**
 * E-mail de pessoa (UserData): opcional e pode repetir entre cadastros.
 * Vazio ou só espaços vira null; preenchido precisa ser um e-mail válido.
 */
export const personEmailSchema = z.preprocess(
    v => (typeof v === 'string' ? v.trim() || null : v),
    z.string().email('E-mail inválido').nullable().optional(),
);
