import { z } from 'zod';

// Validação do conteúdo de um convênio (criação e edição). O conteúdo aparece
// numa página pública, então todo texto tem limite de tamanho.

// Texto opcional: string vazia vira null (o admin apagou o campo).
const optionalText = (max: number) =>
    z.preprocess(
        v => (typeof v === 'string' && v.trim() === '' ? null : v),
        z.string().trim().max(max, `Máximo de ${max} caracteres`).nullable().optional(),
    );

const listItem = (max: number, msg: string) =>
    z.string().trim().min(1, msg).max(max, `Máximo de ${max} caracteres por item`);

export const convenioSchema = z.object({
    slug: z
        .string()
        .trim()
        .toLowerCase()
        .min(1, 'Informe o endereço da página')
        .max(60, 'Endereço muito longo')
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use só letras minúsculas, números e hífens (ex.: unimed, odonto-sul)'),
    name: z.string().trim().min(1, 'Informe o nome do convênio').max(60, 'Nome muito longo'),
    title: z.string().trim().min(1, 'Informe o título da página').max(120, 'Título muito longo'),
    subtitle: optionalText(160),
    intro: optionalText(2000),

    priceLabelHeader: z.string().trim().min(1, 'Informe o cabeçalho da coluna').max(40).optional(),
    priceValueHeader: z.string().trim().min(1, 'Informe o cabeçalho da coluna').max(40).optional(),
    priceRows: z
        .array(
            z.object({
                label: listItem(60, 'Informe a faixa de cada linha da tabela'),
                priceCents: z
                    .number()
                    .int('Valor inválido')
                    .min(0, 'Valor não pode ser negativo')
                    .max(100_000_000, 'Valor muito alto'),
            }),
        )
        .max(60, 'Máximo de 60 linhas na tabela')
        .optional(),
    priceNote: optionalText(500),

    documentsTitle: z.string().trim().min(1, 'Informe o título da lista de documentos').max(60).optional(),
    documents: z.array(listItem(160, 'Documento em branco')).max(40, 'Máximo de 40 documentos').optional(),

    highlightsTitle: optionalText(60),
    highlights: z.array(listItem(160, 'Destaque em branco')).max(40, 'Máximo de 40 destaques').optional(),

    aboutTitle: optionalText(160),
    aboutText: optionalText(4000),

    isActive: z.boolean().optional(),
    order: z.number().int().min(0).max(9999).optional(),
});

export const convenioUpdateSchema = convenioSchema.partial().extend({
    // Só aceita limpar o logo por aqui; enviar um novo é pelo upload.
    logoUrl: z.null().optional(),
});

export type ConvenioParsed = z.infer<typeof convenioSchema>;

export function firstIssue(error: z.ZodError): string {
    return error.issues[0]?.message ?? 'Dados inválidos';
}
