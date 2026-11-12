import { z } from 'zod';
import type { AdminExportRow, ExportRepository } from '../../../ports/external/export-repository.js';
import { idList, text } from '../filters.js';
import { personFields, reportFields } from './person-fields.js';
import type { ExportField, ExportFilterDescription, ExportSource } from './types.js';

// Fonte `admins`: Usuários › Administradores (permissão READ_USER_ADMIN).
//
// Permissão cruzada (decisão 006, item 2): quem só tem READ_USER_ADMIN já
// exportava usuário, nome, e-mail, CPF, telefone, regra e "criado em". Esses
// continuam só com READ_USER_ADMIN. O resto da pessoa (RG, endereço, renda…)
// pede também READ_USER, para ninguém ganhar acesso que não tinha.
//
// AS CHAVES SÃO CONTRATO: não se renomeia nem se reaproveita uma chave.

const filters = z.object({
    ids: idList,
    search: text,
    rulesId: text,
});

type AdminFilters = z.infer<typeof filters>;

const filterLabels = {
    search: 'Busca',
    rulesId: 'Regra de acesso',
};

/** Campos da pessoa que já saíam na planilha de administradores antes do montador. */
export const ADMIN_FREE_PERSON_FIELDS = ['name', 'email', 'cpf', 'phone'] as const;

const adminFields: ExportField<AdminExportRow>[] = [
    { key: 'username',
label: 'Usuário',
group: 'Acesso',
type: 'text',
privacy: 'comum',
value: a => a.username },
    { key: 'rule',
label: 'Regra de acesso',
group: 'Acesso',
type: 'text',
privacy: 'comum',
value: a => a.rules.name },
    // "Criado em" é o do acesso ao painel; o "Cadastrado em" da pessoa é outro campo.
    { key: 'adminCreatedAt',
label: 'Criado em',
group: 'Acesso',
type: 'datetime',
privacy: 'comum',
value: a => a.createdAt },
];

/** As 7 colunas de hoje, na ordem de hoje. Congeladas pelo teste de ouro. */
const PADRAO = ['username', 'name', 'email', 'cpf', 'phone', 'rule', 'adminCreatedAt'];

/**
 * "Regra de acesso: SECRETARIA". O nome vem das linhas (filtradas pela
 * regra, todas têm a mesma); sem nenhuma linha, vem pelo id.
 */
async function describeFilters(f: AdminFilters, rows: AdminExportRow[], repo: ExportRepository): Promise<ExportFilterDescription[]> {
    const out: ExportFilterDescription[] = [];
    if (f.search) out.push({ nome: filterLabels.search,
valor: f.search });
    if (f.rulesId) {
        const name = rows[0]?.rules.name ?? (await repo.ruleName(f.rulesId));
        out.push({ nome: filterLabels.rulesId,
valor: name ?? f.rulesId });
    }
    return out;
}

export const adminsSource: ExportSource<AdminExportRow, AdminFilters> = {
    dataset: 'admins',
    filters,
    filterLabels,
    describeFilters,
    fields: [
        ...adminFields,
        // "Usuário do painel" repete o "Usuário" do próprio administrador.
        ...personFields<AdminExportRow>(a => a.userData, {
            permission: 'READ_USER',
            free: ADMIN_FREE_PERSON_FIELDS,
            exclude: ['adminUsername'],
        }),
        ...reportFields<AdminExportRow>(),
    ],
    padrao: PADRAO,
    modelos: [{ id: 'contato',
name: 'Contato',
fields: ['name', 'phone', 'email'] }],
    query: (repo, { ids, ...rest }, take) => repo.admins({ ids,
...rest,
take }),
    firstName: row => row.userData.name,
};
