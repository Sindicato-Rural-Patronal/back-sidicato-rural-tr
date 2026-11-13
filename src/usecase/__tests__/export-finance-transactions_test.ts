import { describe, it, expect, vi } from 'vitest';
import { ExportDataUseCase } from '../export-data.js';
import { empenhoName } from '../export/catalog/finance-transactions.js';
import type { ExportRepository } from '../../ports/external/export-repository.js';

// O CSV dos lançamentos (SR-039, SR-064). Desde a SR-102 ele é o padrão da
// fonte `finance-transactions` do montador de relatórios (a rota antiga
// `GET /admin/finance/transactions/export` foi apagada na SR-119). O byte a byte está no
// teste de ouro (`export-golden-fase2b_test.ts`).

const row = (over: object) => ({
    id: 'tx',
    number: 12,
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

const repoWith = (rows: object[]) => ({ financeTransactions: vi.fn().mockResolvedValue(rows) }) as unknown as ExportRepository;

async function csvOf(rows: object[]) {
    const r = await new ExportDataUseCase(repoWith(rows)).execute('finance-transactions', {});
    return r.result!.csv.replace(/^﻿/, '').trim().split('\r\n').map(l => l.slice(1, -1).split('";"'));
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
    it('"Nº" primeiro; depois da Descrição, o fornecedor e o "Nº anterior"', async () => {
        const [header] = await csvOf([]);
        expect(header).toEqual([
            'Nº', 'Data', 'Tipo', 'Caixa', 'Categoria', 'Descrição', 'Nome / Razão social', 'CNPJ / CPF',
            'Nº anterior', 'Método', 'Recorrente', 'Valor (R$)', 'Observações',
        ]);
    });

    it('"Nº" é o number (vazio sem número) e "Nº anterior" é o empenho.numero (SR-064)', async () => {
        const [, a, b] = await csvOf([
            row({ number: 128,
empenho: { numero: ' 0045 ' } }),
            row({ number: null }),
        ]);
        expect(a[0]).toBe('128');
        expect(a[8]).toBe('0045');
        expect(b[0]).toBe('');
        expect(b[8]).toBe('');
    });

    it('passa a ordem pedida para a consulta', async () => {
        const repo = repoWith([]);
        await new ExportDataUseCase(repo).execute('finance-transactions', { orderBy: 'number' });
        expect(vi.mocked(repo.financeTransactions).mock.calls[0][0].orderBy).toBe('number');
    });

    it('preenche com o empenho; lançamento sem empenho fica com as duas vazias', async () => {
        const [, a, b, c] = await csvOf([
            row({ empenho: { razaoSocial: 'COOP LTDA',
nomeFantasia: 'COOP',
cnpjCpf: '12.345.678/0001-90' } }),
            row({ empenho: { nomeFantasia: 'MECANICA DO ZE' } }),
            row({}),
        ]);
        expect(a.slice(5, 8)).toEqual(['Compra', 'COOP LTDA', '12.345.678/0001-90']);
        expect(b.slice(5, 8)).toEqual(['Compra', 'MECANICA DO ZE', '']);
        expect(c.slice(5, 8)).toEqual(['Compra', '', '']);
    });
});
