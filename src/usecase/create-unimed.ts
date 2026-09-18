import { z } from 'zod';
import type {
    UnimedRepository,
    UnimedBeneficiarioModel,
    UnimedCreateInput,
} from '../ports/external/unimed-repository.js';
import { ValidationError } from '../errors/validation.js';
import { UnimedBeneficiarioAlreadyExistsError } from '../errors/conflict.js';
import { onlyDigits, unimedFieldsIssue } from '../lib/unimed-options.js';

// String opcional: "" e null viram undefined (não sobrescreve com vazio).
const optionalString = z.preprocess(
    v => (v === '' || v == null ? undefined : v),
    z.string().optional(),
);

// CNS chega mascarado do painel ("700 0000 0000 0000") e é gravado só com dígitos.
const optionalDigits = z.preprocess(
    v => (v === '' || v == null ? undefined : typeof v === 'string' ? onlyDigits(v) || undefined : v),
    z.string().optional(),
);

// A pessoa (nome, cpf, endereço…) vive no UserData — aqui só os campos do convênio.
export const unimedSchema = z.object({
    userDataId: z.string().uuid('userDataId inválido'),
    dataAdesao: z.preprocess(
        v => (v === '' || v == null ? null : v),
        z.coerce.date().nullable().optional(),
    ),
    tipoMovimento: optionalString,
    tipoDependente: optionalString,
    grauDependencia: optionalString,
    cns: optionalDigits,
    nomeMae: optionalString,
    profissao: optionalString,
    plano: optionalString,
    matricula: optionalString,
    empresa: optionalString,
    contratante: optionalString,
    titularId: optionalString,
    motivo: optionalString,
    obs: optionalString,
});

export class CreateUnimedUseCase {
    constructor(private readonly repo: UnimedRepository) {}

    async execute(
        input: unknown,
        createdBy: string | null,
    ): Promise<{
 error?: Error;
beneficiario?: UnimedBeneficiarioModel 
}> {
        const parsed = unimedSchema.safeParse(input);
        if (!parsed.success) {
            return { error: new ValidationError(parsed.error.issues[0]?.message ?? 'Dados inválidos') };
        }
        // Listas fixas (tipo de movimento / grau de dependência) e CNS.
        const issue = unimedFieldsIssue(parsed.data);
        if (issue) return { error: new ValidationError(issue) };

        // 1:1 com UserData — bloqueia um segundo cadastro ativo para a mesma pessoa.
        const existing = await this.repo.findByUserDataId(parsed.data.userDataId);
        if (existing) return { error: new UnimedBeneficiarioAlreadyExistsError() };

        const beneficiario = await this.repo.create({
            ...(parsed.data as UnimedCreateInput),
            createdBy,
        });
        return { beneficiario };
    }
}
