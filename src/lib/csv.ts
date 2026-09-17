// CSV para abrir direto no Excel em português: BOM UTF-8, separador ";",
// quebra de linha "\r\n" e todas as células entre aspas.

export type CsvValue = string | number | boolean | Date | null | undefined;

export type CsvColumn<T> = {
    header: string;
    value: (row: T) => CsvValue;
};

// Texto que começa com = + - @ (ou tab/CR) vira fórmula no Excel. Um apóstrofo
// na frente impede a execução (CSV injection). Números não passam por aqui.
function neutralizeFormula(text: string): string {
    return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

function cellText(value: CsvValue): string {
    if (value == null) return '';
    if (value instanceof Date) return csvDate(value);
    if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
    if (typeof value === 'number') return String(value).replace('.', ',');
    return neutralizeFormula(value);
}

function quote(text: string): string {
    return `"${text.replace(/"/g, '""')}"`;
}

export function toCsv<T>(columns: CsvColumn<T>[], rows: T[]): string {
    const lines = [columns.map(c => quote(c.header)).join(';')];
    for (const row of rows) {
        lines.push(columns.map(c => quote(cellText(c.value(row)))).join(';'));
    }
    return `﻿${lines.join('\r\n')}\r\n`;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** dd/mm/aaaa (datas puras ficam em UTC no banco). */
export function csvDate(d: Date | null | undefined): string {
    if (!d) return '';
    return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

/**
 * dd/mm/aaaa hh:mm lendo os campos UTC como estão. Para horários que o painel
 * grava "no relógio local" com Z (início/fim de curso, prazo de inscrição).
 */
export function csvWallClock(d: Date | null | undefined): string {
    if (!d) return '';
    return `${csvDate(d)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** dd/mm/aaaa hh:mm no horário de Brasília (momentos, ex.: criado em). */
export function csvDateTime(d: Date | null | undefined): string {
    if (!d) return '';
    return new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    })
        .format(d)
        .replace(',', '');
}

/** 1234.5 → "1.234,50" */
export function csvMoney(value: number | null | undefined): string {
    if (value == null) return '';
    return value.toLocaleString('pt-BR', { minimumFractionDigits: 2,
maximumFractionDigits: 2 });
}

/** Junta vários valores numa célula: "A | B | C". */
export function csvList(values: (string | null | undefined)[]): string {
    return values.filter(v => v != null && v !== '').join(' | ');
}
