import { z } from 'zod';
import type { ContactMessageExportRow } from '../../../ports/external/export-repository.js';
import { bool, idList, text } from '../filters.js';
import { reportFields } from './person-fields.js';
import type { ExportField, ExportFilterDescription, ExportSource } from './types.js';

// Fonte `contact-messages`: as mensagens do formulário de contato do site
// (permissão READ_CONTACT). Pessoais são o contato de quem mandou e o texto
// livre da mensagem (decisão 006, inventário).
//
// AS CHAVES SÃO CONTRATO: não se renomeia nem se reaproveita uma chave.

const filters = z.object({
    ids: idList,
    search: text,
    read: bool,
});

type ContactMessageFilters = z.infer<typeof filters>;

const filterLabels = {
    search: 'Busca',
    read: 'Só lidas',
};

const messageFields: ExportField<ContactMessageExportRow>[] = [
    // Mensagem
    { key: 'receivedAt',
label: 'Recebida em',
group: 'Mensagem',
type: 'datetime',
privacy: 'comum',
value: m => m.createdAt },
    { key: 'subject',
label: 'Assunto',
group: 'Mensagem',
type: 'text',
privacy: 'comum',
weight: 3,
value: m => m.subject },
    { key: 'message',
label: 'Mensagem',
group: 'Mensagem',
type: 'text',
privacy: 'pessoal',
weight: 6,
value: m => m.message },
    { key: 'read',
label: 'Lida',
group: 'Mensagem',
type: 'boolean',
privacy: 'comum',
value: m => m.read },

    // Quem mandou
    { key: 'name',
label: 'Nome',
group: 'Quem mandou',
type: 'text',
privacy: 'comum',
weight: 3,
value: m => m.name },
    { key: 'email',
label: 'E-mail',
group: 'Quem mandou',
type: 'text',
privacy: 'pessoal',
weight: 3,
value: m => m.email },
    { key: 'phone',
label: 'Telefone',
group: 'Quem mandou',
type: 'phone',
privacy: 'pessoal',
value: m => m.phone },
];

/** As 7 colunas de hoje, na ordem de hoje. Congeladas pelo teste de ouro. */
const PADRAO = ['receivedAt', 'name', 'email', 'phone', 'subject', 'message', 'read'];

/** "Busca: silva · Só lidas" (ou "Só não lidas"). */
function describeFilters(f: ContactMessageFilters): ExportFilterDescription[] {
    const out: ExportFilterDescription[] = [];
    if (f.search) out.push({ nome: filterLabels.search,
valor: f.search });
    if (f.read !== undefined) out.push({ nome: f.read ? filterLabels.read : 'Só não lidas',
valor: 'Sim' });
    return out;
}

export const contactMessagesSource: ExportSource<ContactMessageExportRow, ContactMessageFilters> = {
    dataset: 'contact-messages',
    filters,
    filterLabels,
    describeFilters,
    fields: [...messageFields, ...reportFields<ContactMessageExportRow>()],
    padrao: PADRAO,
    modelos: [{ id: 'contato',
name: 'Contato',
fields: ['name', 'email', 'phone'] }],
    query: (repo, { ids, ...rest }, take) => repo.contactMessages({ ids,
...rest,
take }),
    firstName: row => row.name,
};
