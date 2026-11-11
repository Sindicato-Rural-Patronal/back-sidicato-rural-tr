import type { Permission } from '../../generated/prisma/enums.js';

// Conjuntos exportáveis por `/admin/export/:dataset`: a permissão de cada um,
// o título e o começo do nome do arquivo. Os que já têm o montador de
// relatórios (decisão 006) estão em `catalog/index.ts`; os outros ainda saem
// pelo caminho antigo de `usecase/export-data.ts` (fase 2).

export const EXPORT_DATASETS = {
    people: { permission: 'READ_USER',
title: 'Pessoas',
file: 'pessoas',
single: 'pessoa' },
    companies: { permission: 'READ_USER',
title: 'Empresas',
file: 'empresas',
single: 'empresa' },
    properties: { permission: 'READ_USER',
title: 'Propriedades',
file: 'propriedades',
single: 'propriedade' },
    admins: { permission: 'READ_USER_ADMIN',
title: 'Administradores',
file: 'administradores',
single: 'administrador' },
    courses: { permission: 'READ_COURSE',
title: 'Cursos',
file: 'cursos',
single: 'curso' },
    registrations: { permission: 'READ_COURSE',
title: 'Inscrições',
file: 'inscricoes',
single: 'inscricao' },
    'contact-messages': { permission: 'READ_CONTACT',
title: 'Mensagens de contato',
file: 'mensagens',
single: 'mensagem' },
    unimed: { permission: 'READ_USER',
title: 'Beneficiários Unimed',
file: 'unimed',
single: 'unimed' },
    'audit-logs': { permission: 'READ_AUDIT',
title: 'Auditoria',
file: 'auditoria',
single: 'auditoria' },
    'room-bookings': { permission: 'READ_COURSE',
title: 'Reservas de sala',
file: 'reservas-de-sala',
single: 'reserva' },
    // Relatorio de cadastros: os quatro tipos num arquivo so. Pede
    // READ_USER_ADMIN porque traz os administradores e READ_USER porque traz
    // CPF, RG e endereco de todas as pessoas (as permissoes nao sao
    // hierarquicas: uma nao implica a outra). Quem so tem READ_USER continua
    // com as exportacoes de cada tipo, que ja existem.
    cadastros: { permission: 'READ_USER_ADMIN',
alsoRequires: 'READ_USER',
title: 'Relatório de cadastros',
file: 'relatorio-de-cadastros',
single: 'cadastro' },
} as const satisfies Record<string, {
 permission: Permission;
alsoRequires?: Permission;
title: string;
file: string;
single: string
}>;

export type ExportDataset = keyof typeof EXPORT_DATASETS;
