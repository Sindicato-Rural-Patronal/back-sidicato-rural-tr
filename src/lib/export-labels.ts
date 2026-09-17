// Rótulos em português dos enums, para as planilhas exportadas. Os mesmos
// textos das telas do painel (front: lib/user-form-options.ts).

export const GENDER_LABEL: Record<string, string> = {
    MALE: 'Masculino',
    FEMALE: 'Feminino',
    OTHER: 'Outro',
};

export const ETHNICITY_LABEL: Record<string, string> = {
    WHITE: 'Branca',
    BLACK: 'Preta',
    MIXED: 'Parda',
    ASIAN: 'Amarela',
    INDIGENOUS: 'Indígena',
};

export const EDUCATION_LABEL: Record<string, string> = {
    NO_FORMAL_EDUCATION: 'Sem escolaridade',
    INCOMPLETE_PRIMARY: 'Fundamental incompleto',
    COMPLETE_PRIMARY: 'Fundamental completo',
    INCOMPLETE_SECONDARY: 'Médio incompleto',
    COMPLETE_SECONDARY: 'Médio completo',
    INCOMPLETE_HIGHER: 'Superior incompleto',
    COMPLETE_HIGHER: 'Superior completo',
    POSTGRADUATE: 'Pós-graduação',
};

export const MARITAL_STATUS_LABEL: Record<string, string> = {
    SINGLE: 'Solteiro(a)',
    MARRIED: 'Casado(a)',
    DIVORCED: 'Divorciado(a)',
    WIDOWED: 'Viúvo(a)',
    DOMESTIC_PARTNERSHIP: 'União estável',
};

export const MEMBER_STATUS_LABEL: Record<string, string> = {
    ACTIVE: 'Ativo',
    INACTIVE: 'Inativo',
};

export const ADDRESS_TYPE_LABEL: Record<string, string> = {
    URBAN: 'Urbano',
    RURAL: 'Rural',
};

export const COMPANY_TYPE_LABEL: Record<string, string> = {
    PRIVATE: 'Privada',
    PUBLIC: 'Pública',
};

export const COURSE_STATUS_LABEL: Record<string, string> = {
    PUBLIC: 'Público',
    PRIVATE: 'Privado',
    UNPUBLISHED: 'Não publicado',
    IN_PROGRESS: 'Em andamento',
};

export const AUDIT_METHOD_LABEL: Record<string, string> = {
    POST: 'Criou',
    PATCH: 'Editou',
    PUT: 'Editou',
    DELETE: 'Excluiu',
    EXPORT: 'Exportou',
};

/** Rótulo do enum; valor desconhecido volta como veio, nulo vira vazio. */
export function label(map: Record<string, string>, value: string | null | undefined): string {
    if (!value) return '';
    return map[value] ?? value;
}
