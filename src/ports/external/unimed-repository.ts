import type { UnimedBeneficiarioModel } from '../../generated/prisma/models/UnimedBeneficiario.js';

export type { UnimedBeneficiarioModel };

// Dados básicos do UserData embutidos (para a tabela / detalhe do beneficiário).
export type UnimedUserDataBasic = { id: string; name: string; cpf: string | null };

// Beneficiário já com o UserData básico embutido.
export type UnimedWithUser = UnimedBeneficiarioModel & { userData: UnimedUserDataBasic };

export type UnimedCreateInput = {
    userDataId: string;
    dataAdesao?: Date | null;
    tipoMovimento?: string | null;
    tipoDependente?: string | null;
    grauDependencia?: string | null;
    cns?: string | null;
    nomeMae?: string | null;
    profissao?: string | null;
    plano?: string | null;
    matricula?: string | null;
    empresa?: string | null;
    contratante?: string | null;
    titularId?: string | null;
    motivo?: string | null;
    obs?: string | null;
    createdBy?: string | null;
};

// Atualização parcial — não muda o vínculo com o usuário nem o autor do cadastro.
export type UnimedUpdateInput = Partial<Omit<UnimedCreateInput, 'userDataId' | 'createdBy'>>;

export type UnimedListFilters = { page: number; limit: number; search?: string };

export interface UnimedRepository {
    create(input: UnimedCreateInput): Promise<UnimedBeneficiarioModel>;
    update(id: string, input: UnimedUpdateInput): Promise<UnimedBeneficiarioModel>;
    softDelete(id: string): Promise<boolean>;
    findById(id: string): Promise<UnimedWithUser | null>;
    findByUserDataId(userDataId: string): Promise<UnimedBeneficiarioModel | null>;
    list(filters: UnimedListFilters): Promise<{ items: UnimedWithUser[]; total: number }>;
}
