import { z } from 'zod';
import { isValidCnpj } from '../lib/cnpj.js';
import { isValidBrPhone } from '../lib/br-validators.js';

// Validação das empresas (criação, edição, vínculos e propriedades).

const emptyToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);

const optionalText = (max: number) =>
    z.preprocess(emptyToNull, z.string().trim().max(max, `Máximo de ${max} caracteres`).nullable().optional());

const optionalPhone = z.preprocess(
    emptyToNull,
    z.string().refine(isValidBrPhone, 'Telefone inválido: use DDD + número').nullable().optional(),
);

export const companySchema = z.object({
    name: z.string().trim().min(1, 'Informe o nome da empresa').max(160, 'Nome muito longo'),
    // Guardado só com dígitos.
    cnpj: z.preprocess(
        v => (typeof v === 'string' ? v.replace(/\D/g, '') || null : v),
        z.string().refine(isValidCnpj, 'CNPJ inválido').nullable().optional(),
    ),
    stateRegistration: optionalText(30),
    type: z.enum(['PRIVATE', 'PUBLIC'], { message: 'Tipo deve ser privada ou pública' }).optional(),
    phone: optionalPhone,
    phone2: optionalPhone,
    phone3: optionalPhone,
    email: z.preprocess(emptyToNull, z.string().trim().email('E-mail inválido').max(160).nullable().optional()),
    website: z.preprocess(
        emptyToNull,
        z.string().trim().url('Site inválido: comece com https://').max(300).nullable().optional(),
    ),
    notes: optionalText(4000),
    isPartner: z.boolean().optional(),
    partnerUrl: z.preprocess(
        emptyToNull,
        z.string().trim().url('Site do parceiro inválido: comece com https://').max(500).nullable().optional(),
    ),
    partnerOrder: z.number().int().min(0).max(9999).nullable().optional(),
    primaryPropertyId: z.string().trim().min(1, 'Propriedade inválida').max(64).nullable().optional(),
});

export const companyUpdateSchema = companySchema.partial().extend({
    // Só aceita remover o logo por aqui; enviar é pelo upload.
    partnerLogo: z.null().optional(),
});

export const memberSchema = z.object({
    userDataId: z.string().trim().min(1, 'Pessoa inválida').max(64),
    title: z.string().trim().min(1, 'Informe o título da pessoa na empresa').max(80, 'Título muito longo'),
});

export const memberUpdateSchema = memberSchema.pick({ title: true });

const addressText = (max: number) => z.string().trim().max(max).optional();

export const companyPropertySchema = z.object({
    name: z.string().trim().min(1, 'Informe o nome da propriedade/endereço').max(120),
    registration: z.preprocess(emptyToNull, z.string().trim().max(60).nullable().optional()),
    address: z.object({
        type: z.enum(['URBAN', 'RURAL']).optional(),
        city: addressText(120),
        state: addressText(2),
        zipCode: addressText(9),
        complement: addressText(160),
        notes: addressText(500),
        street: addressText(160),
        number: addressText(20),
        neighborhood: addressText(120),
        localityName: addressText(120),
        road: addressText(120),
        km: addressText(20),
        lot: addressText(40),
        section: addressText(40),
    }, { message: 'Informe o endereço' }),
});

export const companyListQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().max(100).optional(),
    type: z.enum(['PRIVATE', 'PUBLIC']).optional(),
    isPartner: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
});

export const reorderPartnersSchema = z.object({
    order: z.array(z.string().trim().min(1, 'Id de empresa inválido').max(64)).min(1, 'Informe a ordem'),
});

export function firstIssue(error: z.ZodError): string {
    return error.issues[0]?.message ?? 'Dados inválidos';
}
