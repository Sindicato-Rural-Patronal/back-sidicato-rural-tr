import type { ConvenioModel } from '../../generated/prisma/models/Convenio.js';

export type { ConvenioModel };

/** Linha da tabela de preços: "0 a 18 anos" → R$ 317,13 (em centavos). */
export type ConvenioPriceRow = {
 label: string;
priceCents: number 
};

export type ConvenioInput = {
    slug: string;
    name: string;
    title: string;
    subtitle?: string | null;
    intro?: string | null;
    priceLabelHeader?: string;
    priceValueHeader?: string;
    priceRows?: ConvenioPriceRow[];
    priceNote?: string | null;
    documentsTitle?: string;
    documents?: string[];
    highlightsTitle?: string | null;
    highlights?: string[];
    aboutTitle?: string | null;
    aboutText?: string | null;
    isActive?: boolean;
    order?: number;
};

// `logoUrl` não vem do formulário: é gravado pelo upload ou limpo pelo admin.
export type ConvenioUpdateInput = Partial<ConvenioInput> & { logoUrl?: string | null };

/** Item do menu público "Convênios": só o necessário pro dropdown. */
export type ConvenioMenuItem = {
    id: string;
    slug: string;
    name: string;
    subtitle: string | null;
    logoUrl: string | null;
    order: number;
};

export interface ConvenioRepository {
    /** Convênios ativos, na ordem do menu. */
    listMenu(): Promise<ConvenioMenuItem[]>;
    /** Todos (admin), inclusive inativos. */
    findAll(): Promise<ConvenioModel[]>;
    findById(id: string): Promise<ConvenioModel | null>;
    findBySlug(slug: string): Promise<ConvenioModel | null>;
    create(data: ConvenioInput): Promise<ConvenioModel>;
    update(id: string, data: ConvenioUpdateInput): Promise<ConvenioModel>;
    delete(id: string): Promise<void>;
}
