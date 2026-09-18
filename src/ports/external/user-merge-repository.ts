import type { UserDataModel } from '../../generated/prisma/models/UserData.js';
import type { UserDataUpdateInput } from './user-data-repository.js';

/** Por que os dois cadastros foram apontados como possível duplicidade. */
export type DuplicateReason = 'NOME' | 'TELEFONE' | 'EMAIL';

export type DuplicateCounts = {
    registrations: number;
    companies: number;
    properties: number;
    relations: number;
};

export type DuplicatePerson = {
    id: string;
    name: string;
    cpf: string | null;
    email: string | null;
    phone: string;
    createdAt: Date;
    /** Tem conta de acesso ao painel (UserAdmin — inclusive excluída: a coluna é única). */
    hasLogin: boolean;
    counts: DuplicateCounts;
};

export type DuplicateGroup = {
    /** Valor normalizado que uniu o grupo (nome sem acento, telefone só com dígitos, e-mail minúsculo). */
    key: string;
    reason: DuplicateReason;
    people: DuplicatePerson[];
};

/** Pessoa carregada para a junção: o cadastro inteiro + se ela tem login. */
export type MergeSide = UserDataModel & { hasLogin: boolean };

export type MergeCounts = {
    movedRegistrations: number;
    movedCompanies: number;
    movedProperties: number;
    movedRelations: number;
};

export interface UserMergeRepository {
    /** Grupos de possíveis duplicados (no máximo `limit` grupos). */
    findDuplicateGroups(limit: number): Promise<DuplicateGroup[]>;
    /** As mesmas informações dos duplicados, para comparar dois cadastros escolhidos à mão. */
    findPeopleForCompare(ids: string[]): Promise<DuplicatePerson[]>;
    /** Acha a pessoa mesmo excluída (a junção precisa recusar cadastro já excluído). */
    findForMerge(id: string): Promise<MergeSide | null>;
    /**
     * Junta os dois cadastros numa transação só: leva tudo de `removeId` para
     * `keepId`, grava `fill` no que fica e marca o outro como excluído.
     */
    merge(input: {
        keepId: string;
        removeId: string;
        fill: UserDataUpdateInput;
    }): Promise<MergeCounts>;
}
