import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExportDataUseCase } from '../export-data.js';
import type { ExportRepository } from '../../ports/external/export-repository.js';
import { COURSE_STATUS_LABEL, label } from '../../lib/export-labels.js';

// Presença na planilha de inscrições e o status "Concluído".

const repo = { registrations: vi.fn() } as unknown as ExportRepository;
const now = () => new Date('2026-09-17T13:00:00.000Z');

function registration(id: string, attended: boolean | null) {
    return {
        id,
        confirmed: true,
        attended,
        createdAt: new Date('2026-09-01T12:00:00.000Z'),
        ficha: null,
        course: { name: 'CURSO',
eventNumber: null,
startTime: new Date('2026-09-10T08:00:00.000Z') },
        userData: {
            name: `PESSOA ${id}`,
            cpf: null,
            email: null,
            phone: '44999990000',
            birthDate: null,
            memberStatus: null,
            membershipValidUntil: null,
            boardPosition: null,
            publicContact: null,
            companyMemberships: [],
        },
    };
}

function parse(csv: string): string[][] {
    return csv
        .replace(/^﻿/, '')
        .trim()
        .split('\r\n')
        .map(line => line.slice(1, -1).split('";"'));
}

describe('exportação de inscrições: presença', () => {
    beforeEach(() => vi.clearAllMocks());

    it('coluna "Presença": Presente, Faltou ou vazio', async () => {
        vi.mocked(repo.registrations).mockResolvedValue([
            registration('a', true),
            registration('b', false),
            registration('c', null),
        ] as never);
        const r = await new ExportDataUseCase(repo, now).execute('registrations', {});
        const [header, ...rows] = parse(r.result!.csv);
        const col = header.indexOf('Presença');
        expect(col).toBeGreaterThan(header.indexOf('Confirmada'));
        expect(rows.map(row => row[col])).toEqual(['Presente', 'Faltou', '']);
    });

    it('status COMPLETED sai como "Concluído" e é aceito no filtro de cursos', async () => {
        expect(label(COURSE_STATUS_LABEL, 'COMPLETED')).toBe('Concluído');
        const courses = vi.fn().mockResolvedValue([]);
        const r = await new ExportDataUseCase({ courses } as unknown as ExportRepository, now).execute('courses', {
            status: 'COMPLETED',
        });
        expect(r.error).toBeUndefined();
        expect(courses).toHaveBeenCalledWith(expect.objectContaining({ status: 'COMPLETED' }));
    });
});
