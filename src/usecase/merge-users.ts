import type {
    DuplicateGroup,
    DuplicatePerson,
    MergeSide,
    UserMergeRepository,
} from '../ports/external/user-merge-repository.js';
import type { UserDataUpdateInput } from '../ports/external/user-data-repository.js';
import { UserDataNotFoundError } from '../errors/not-found.js';
import { ValidationError } from '../errors/validation.js';
import { MergeBothHaveLoginError, MergeDifferentCpfError } from '../errors/conflict.js';

// Juntar dois cadastros da mesma pessoa. Acontece porque a inscrição pública em
// curso só reconhece a pessoa pelo CPF: quem já estava no cadastro antigo sem CPF
// ganha um segundo cadastro ao se inscrever. A equipe escolhe qual fica; o outro
// é marcado como excluído (nunca apagado de verdade).

/** Campos que a junção copia do cadastro removido para o que fica, se lá estiver vazio. */
const FILLABLE: {
 field: keyof UserDataUpdateInput;
label: string 
}[] = [
    { field: 'cpf',
label: 'CPF' },
    { field: 'email',
label: 'E-mail' },
    { field: 'phone',
label: 'Telefone' },
    { field: 'phone2',
label: 'Telefone 2' },
    { field: 'phone3',
label: 'Telefone 3' },
    { field: 'avatar',
label: 'Foto' },
    { field: 'nickname',
label: 'Apelido' },
    { field: 'maritalStatus',
label: 'Estado civil' },
    { field: 'rg',
label: 'RG' },
    { field: 'rgIssuer',
label: 'Órgão emissor do RG' },
    { field: 'rgIssuedAt',
label: 'Data de emissão do RG' },
    { field: 'birthDate',
label: 'Data de nascimento' },
    { field: 'driverLicense',
label: 'CNH' },
    { field: 'driverLicenseCategory',
label: 'Categoria da CNH' },
    { field: 'birthPlace',
label: 'Naturalidade' },
    { field: 'nationality',
label: 'Nacionalidade' },
    { field: 'gender',
label: 'Gênero' },
    { field: 'ethnicity',
label: 'Etnia' },
    { field: 'educationLevel',
label: 'Escolaridade' },
    { field: 'functionalCategory',
label: 'Categoria funcional' },
    { field: 'specialNeeds',
label: 'Necessidades especiais' },
    { field: 'memberClassification',
label: 'Classificação' },
    { field: 'cadPro',
label: 'CAD/PRO' },
    { field: 'familyIncome',
label: 'Renda familiar' },
    { field: 'memberType',
label: 'Tipo de membro' },
    { field: 'boardPosition',
label: 'Cargo na diretoria' },
    { field: 'boardMember',
label: 'Membro da diretoria' },
    { field: 'memberStatus',
label: 'Situação do associado' },
    { field: 'memberSince',
label: 'Associado desde' },
    { field: 'membershipValidUntil',
label: 'Associado até' },
    { field: 'memberNotes',
label: 'Observações' },
    { field: 'memberNotesNumber',
label: 'Número da ficha' },
    { field: 'primaryPropertyId',
label: 'Endereço principal' },
];

/** Vazio = null, texto em branco, lista vazia ou `false` (caixa desmarcada). */
function isEmpty(value: unknown): boolean {
    if (value === null || value === undefined || value === false) return true;
    if (typeof value === 'string') return value.trim() === '';
    if (Array.isArray(value)) return value.length === 0;
    return false;
}

const digits = (value: string | null | undefined): string => (value ?? '').replace(/\D/g, '');

export type MergeUsersResult = {
    keepId: string;
    removedId: string;
    movedRegistrations: number;
    movedCompanies: number;
    movedProperties: number;
    movedRelations: number;
    /** Nomes (em português) dos campos que estavam vazios e foram preenchidos. */
    filledFields: string[];
};

export class MergeUsersUseCase {
    constructor(private repo: UserMergeRepository) {}

    async execute(request: {
        keepId?: string;
        removeId?: string;
    }): Promise<{
 error?: Error;
result?: MergeUsersResult 
}> {
        const keepId = request.keepId?.trim();
        const removeId = request.removeId?.trim();
        if (!keepId || !removeId) {
            return { error: new ValidationError('Informe os dois cadastros a juntar.') };
        }
        if (keepId === removeId) {
            return { error: new ValidationError('Escolha dois cadastros diferentes.') };
        }

        const [keep, remove] = await Promise.all([
            this.repo.findForMerge(keepId),
            this.repo.findForMerge(removeId),
        ]);
        if (!keep || !remove) return { error: new UserDataNotFoundError() };
        if (keep.isDeleted || remove.isDeleted) {
            return { error: new ValidationError('Cadastro já excluído não pode ser juntado.') };
        }

        // O CPF é a identidade: dois CPFs diferentes são duas pessoas, não uma repetida.
        const keepCpf = digits(keep.cpf);
        const removeCpf = digits(remove.cpf);
        if (keepCpf && removeCpf && keepCpf !== removeCpf) {
            return { error: new MergeDifferentCpfError() };
        }
        // Só um login pode sobrar (UserAdmin.userDataId é único) e apagar acesso
        // de alguém sem pedir é perigoso — a equipe resolve antes.
        if (keep.hasLogin && remove.hasLogin) {
            return { error: new MergeBothHaveLoginError() };
        }

        const { fill, filledFields } = buildFill(keep, remove);
        const counts = await this.repo.merge({ keepId,
removeId,
fill });
        return { result: { keepId,
removedId: removeId,
...counts,
filledFields } };
    }
}

/** Campos vazios no cadastro que fica, preenchidos com o que havia no removido. */
function buildFill(keep: MergeSide, remove: MergeSide): {
    fill: UserDataUpdateInput;
    filledFields: string[];
} {
    const fill: Record<string, unknown> = {};
    const filledFields: string[] = [];
    for (const { field, label } of FILLABLE) {
        const current = (keep as unknown as Record<string, unknown>)[field];
        const incoming = (remove as unknown as Record<string, unknown>)[field];
        if (!isEmpty(current) || isEmpty(incoming)) continue;
        fill[field] = incoming;
        filledFields.push(label);
    }
    return { fill: fill as UserDataUpdateInput,
filledFields };
}

// Possíveis duplicados: mesmo nome normalizado, telefone ou e-mail, com pelo
// menos um dos cadastros sem CPF (é o cadastro antigo que a inscrição pública
// não reconheceu). Um grupo cujas pessoas já apareceram num grupo anterior não
// é repetido (quem tem nome e telefone iguais sai uma vez só).
export class ListDuplicatePeopleUseCase {
    constructor(private repo: UserMergeRepository) {}

    async execute(request: { limit?: number } = {}): Promise<{ groups: DuplicateGroup[] }> {
        const limit = Math.min(Math.max(Number(request.limit) || 50, 1), 200);
        const groups = await this.repo.findDuplicateGroups(limit);
        const seen = new Set<string>();
        const unique: DuplicateGroup[] = [];
        for (const group of groups) {
            const signature = group.people
                .map(p => p.id)
                .sort()
                .join('|');
            if (seen.has(signature)) continue;
            seen.add(signature);
            unique.push(group);
        }
        return { groups: unique };
    }
}

// Comparação lado a lado do diálogo "Juntar cadastros": os dois cadastros com os
// mesmos números da lista de duplicados, na ordem pedida.
export class ComparePeopleForMergeUseCase {
    constructor(private repo: UserMergeRepository) {}

    async execute(rawIds: string[]): Promise<{
 error?: Error;
people?: DuplicatePerson[] 
}> {
        const ids = [...new Set(rawIds.map(id => id.trim()).filter(Boolean))];
        if (ids.length !== 2) {
            return { error: new ValidationError('Informe dois cadastros diferentes para comparar.') };
        }
        const found = await this.repo.findPeopleForCompare(ids);
        if (found.length !== 2) return { error: new UserDataNotFoundError() };
        const byId = new Map(found.map(person => [person.id, person]));
        return { people: ids.map(id => byId.get(id)).filter((p): p is DuplicatePerson => !!p) };
    }
}
