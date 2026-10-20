import { describe, it, expect, vi } from 'vitest';
import { ExportFinanceTransactionsUseCase, empenhoName } from '../export-finance-transactions.js';
import type { FinanceRepository } from '../../ports/external/finance-repository.js';

const row = (over: object) => ({
    id: 'tx',
    type: 'OUT',
    date: new Date('2026-05-10T00:00:00Z'),
    description: 'Compra',
    method: 'PIX',
    notes: null,
    amountCents: 12345,
    recurringId: null,
    category: { name: 'Insumos' },
    account: { name: 'Caixa A' },
    empenho: null,
    ...over,
});

async function csvOf(rows: object[]) {
    const repo = { listTransactionsForExport: vi.fn().mockResolvedValue(rows) } as unknown as FinanceRepository;
    const csv = await new ExportFinanceTransactionsUseCase(repo).execute({});
    return csv.replace(/^﻿/, '').trim().split('\r\n').map(l => l.slice(1, -1).split('";"'));
}

describe('empenhoName', () => {
    it('razão social; sem ela, nome fantasia; sem nenhum, vazio', () => {
        expect(empenhoName({ razaoSocial: 'COOP LTDA',
nomeFantasia: 'COOP' })).toBe('COOP LTDA');
        expect(empenhoName({ razaoSocial: '  ',
nomeFantasia: 'COOP' })).toBe('COOP');
        expect(empenhoName({ nomeFantasia: 'COOP' })).toBe('COOP');
        expect(empenhoName({})).toBe('');
        expect(empenhoName(null)).toBe('');
    });

    it('ignora valor que não é texto (JSON livre)', () => {
        expect(empenhoName({ razaoSocial: 42,
nomeFantasia: ['x'] })).toBe('');
    });
});

describe('CSV dos lançamentos', () => {
    it('duas colunas novas logo depois da Descrição', async () => {
        const [header] = await csvOf([]);
        expect(header).toEqual([
            'Data', 'Tipo', 'Caixa', 'Categoria', 'Descrição', 'Nome / Razão social', 'CNPJ / CPF',
            'Método', 'Recorrente', 'Valor (R$)', 'Observações',
        ]);
    });

    it('preenche com o empenho; lançamento sem empenho fica com as duas vazias', async () => {
        const [, a, b, c] = await csvOf([
            row({ empenho: { razaoSocial: 'COOP LTDA',
nomeFantasia: 'COOP',
cnpjCpf: '12.345.678/0001-90' } }),
            row({ empenho: { nomeFantasia: 'MECANICA DO ZE' } }),
            row({}),
        ]);
        expect(a.slice(4, 7)).toEqual(['Compra', 'COOP LTDA', '12.345.678/0001-90']);
        expect(b.slice(4, 7)).toEqual(['Compra', 'MECANICA DO ZE', '']);
        expect(c.slice(4, 7)).toEqual(['Compra', '', '']);
    });
});
