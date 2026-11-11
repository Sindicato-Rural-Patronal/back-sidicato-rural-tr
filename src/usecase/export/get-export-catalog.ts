import type { Permission } from '../../generated/prisma/enums.js';
import { NotFoundError } from '../../errors/not-found.js';
import { EXPORT_DATASETS, type ExportDataset } from './datasets.js';
import { NO_BUILDER_MESSAGE, sourceOf } from './catalog/index.js';
import type { ExportFieldType, ExportModelo, ExportPrivacy } from './catalog/types.js';
import { EXPORT_LIMITS, NO_EXTRA_PERMISSIONS, type ExportActor } from './engine.js';

// O catálogo de uma fonte para o montador (decisão 006, item 3): os campos
// agrupados, com o que a pessoa pode ou não exportar, o padrão e os modelos.

/** Nome da permissão como aparece na tela de regras ("Visualizar" + área). */
const PERMISSION_LABEL: Partial<Record<Permission, string>> = {
    READ_USER: 'Visualizar usuários',
    READ_COURSE: 'Visualizar cursos',
    READ_USER_ADMIN: 'Visualizar administradores',
    READ_CONTACT: 'Visualizar contatos',
    READ_AUDIT: 'Visualizar auditoria',
    READ_FINANCE: 'Visualizar financeiro',
};

export type CatalogField = {
    key: string;
    label: string;
    type: ExportFieldType;
    privacy: ExportPrivacy;
    allowed: boolean;
    /** Por que está desligado ("Pede a permissão Visualizar usuários"); null quando pode. */
    reason: string | null;
};

export type ExportCatalog = {
    dataset: ExportDataset;
    title: string;
    groups: {
 name: string;
fields: CatalogField[]
}[];
    padrao: string[];
    modelos: ExportModelo[];
    filterLabels: Record<string, string>;
    limits: {
 rows: number;
pdfRows: number;
fields: number
};
};

export class GetExportCatalogUseCase {
    execute(dataset: ExportDataset, actor: ExportActor = NO_EXTRA_PERMISSIONS): {
 error?: Error;
catalog?: ExportCatalog
} {
        const source = sourceOf(dataset);
        if (!source) return { error: new NotFoundError(NO_BUILDER_MESSAGE) };

        const groups: ExportCatalog['groups'] = [];
        for (const f of source.fields) {
            let group = groups.find(g => g.name === f.group);
            if (!group) {
                group = { name: f.group,
fields: [] };
                groups.push(group);
            }
            const allowed = !f.permission || actor.has(f.permission);
            group.fields.push({
                key: f.key,
                label: f.label,
                type: f.type,
                privacy: f.privacy,
                allowed,
                reason: allowed ? null : `Pede a permissão ${PERMISSION_LABEL[f.permission!] ?? f.permission}`,
            });
        }

        return {
            catalog: {
                dataset,
                title: EXPORT_DATASETS[dataset].title,
                groups,
                padrao: [...source.padrao],
                modelos: source.modelos.map(m => ({ ...m,
fields: [...m.fields] })),
                filterLabels: { ...source.filterLabels },
                limits: { ...EXPORT_LIMITS },
            },
        };
    }
}
