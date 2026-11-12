import { describe, it, expect } from 'vitest';
import { buildXlsx, columnName, excelSerial, sheetName, xmlEscape, type XlsxSheet } from '../xlsx.js';
import { readXlsx, serialToIso } from './xlsx-reader.js';

// O gerador de .xlsx (SR-104): o pacote OOXML, os tipos de célula, a largura,
// o cabeçalho preso e a proteção contra fórmula.

const sheet = (over: Partial<XlsxSheet> = {}): XlsxSheet => ({
    name: 'Dados',
    widths: [20, 12],
    header: ['Nome', 'Valor'],
    rows: [],
    ...over,
});

describe('peças', () => {
    it('nome da coluna', () => {
        expect([0, 1, 25, 26, 27, 51, 52, 701, 702].map(columnName)).toEqual(['A', 'B', 'Z', 'AA', 'AB', 'AZ', 'BA', 'ZZ', 'AAA']);
    });

    it('número de série do Excel: dia certo desde 01/03/1900; antes, null', () => {
        expect(excelSerial(new Date(Date.UTC(1900, 2, 1)))).toBe(61);
        expect(excelSerial(new Date(Date.UTC(2026, 9, 5)))).toBe(46300);
        expect(excelSerial(new Date(Date.UTC(2026, 9, 5, 18)))).toBe(46300.75);
        expect(excelSerial(new Date(Date.UTC(1900, 1, 28)))).toBeNull();
        expect(excelSerial(new Date(Number.NaN))).toBeNull();
    });

    it('XML: escapa e tira os caracteres de controle que o XML não aceita (fica tab e quebra de linha)', () => {
        expect(xmlEscape('a<b & "c" > d')).toBe('a&lt;b &amp; &quot;c&quot; &gt; d');
        expect(xmlEscape('x\u0000y\u0001z\u000B\tw\nv')).toBe('xyz\tw\nv');
    });

    it('nome de aba: até 31 caracteres, sem os proibidos, sem repetir', () => {
        const used = new Set<string>();
        expect(sheetName('Pessoas', used)).toBe('Pessoas');
        expect(sheetName('pessoas', used)).toBe('pessoas (2)');
        expect(sheetName('a/b:c?d*e[f]g\\h', used)).toBe('a-b-c-d-e-f-g-h');
        expect(sheetName('x'.repeat(40), used)).toHaveLength(31);
        expect(sheetName("''", used)).toBe('Planilha');
    });
});

describe('o arquivo', () => {
    it('o pacote tem as partes do OOXML, as abas na ordem e a primeira aberta', () => {
        const buf = buildXlsx([sheet(), { name: 'Sobre',
widths: [10, 80],
rows: [] }], new Date('2026-11-11T12:00:00Z'));
        expect(buf.subarray(0, 2).toString()).toBe('PK');
        const { files, sheets } = readXlsx(buf);
        expect([...files.keys()]).toEqual([
            '[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml',
            'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml',
        ]);
        expect(files.get('[Content_Types].xml')).toContain('PartName="/xl/worksheets/sheet2.xml"');
        expect(files.get('xl/_rels/workbook.xml.rels')).toContain('Target="styles.xml"');
        expect(sheets.map(s => s.name)).toEqual(['Dados', 'Sobre']);
        expect(sheets[0].xml).toContain('tabSelected="1"');
        expect(sheets[1].xml).not.toContain('tabSelected');
    });

    it('cabeçalho em negrito e preso; colunas com largura', () => {
        const { sheets: [s] } = readXlsx(buildXlsx([sheet({ rows: [[{ kind: 'text',
value: 'ANA' }, { kind: 'number',
value: 3 }]] })]));
        expect(s.xml).toContain('<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>');
        expect(s.xml).toContain('<cols><col min="1" max="1" width="20" customWidth="1"/><col min="2" max="2" width="12" customWidth="1"/></cols>');
        expect(s.cells.get('A1')).toEqual({ style: 1,
type: 'inlineStr',
value: 'Nome',
formula: false });
        expect(s.xml).toContain('<dimension ref="A1:B2"/>');
        // Fonte 1 é negrito; o estilo 1 usa a fonte 1.
        expect(readXlsx(buildXlsx([sheet()])).files.get('xl/styles.xml')).toContain('<xf numFmtId="49" fontId="1"');
    });

    it('aba sem cabeçalho não prende nada', () => {
        const { sheets: [s] } = readXlsx(buildXlsx([sheet({ header: undefined })]));
        expect(s.xml).not.toContain('<pane');
    });

    it('texto que parece fórmula continua texto: inlineStr, sem <f> e sem apóstrofo', () => {
        const perigosos = ['=HYPERLINK("http://mal","x")', '+55 44 99999-8888', '@SUM(A1:A9)', '-1+1', '\t=1+1', '=1+1'];
        const { sheets: [s] } = readXlsx(buildXlsx([sheet({ widths: [30],
header: ['Texto'],
            rows: perigosos.map(value => [{ kind: 'text',
value }]) })]));
        expect(s.xml).not.toContain('<f>');
        expect(s.xml).not.toContain('<f ');
        perigosos.forEach((value, i) => {
            expect(s.cells.get(`A${i + 2}`)).toEqual({ style: 2,
type: 'inlineStr',
value,
formula: false });
        });
    });

    it('telefone, CPF e CNS só com dígitos ficam texto (não viram "4,5E+10")', () => {
        const { sheets: [s] } = readXlsx(buildXlsx([sheet({ rows: [[{ kind: 'text',
value: '44999998888' }, { kind: 'text',
value: '123456789012345' }]] })]));
        expect(s.cells.get('A2')).toMatchObject({ style: 2,
type: 'inlineStr',
value: '44999998888' });
        expect(s.cells.get('B2')).toMatchObject({ style: 2,
type: 'inlineStr',
value: '123456789012345' });
        // O estilo 2 tem o formato "@" (texto): editar a célula não a transforma em número.
        expect(readXlsx(buildXlsx([sheet()])).files.get('xl/styles.xml')).toContain('<xf numFmtId="49" fontId="0"');
    });

    it('número, dinheiro, data e data e hora', () => {
        const { sheets: [s], files } = readXlsx(buildXlsx([sheet({
            widths: [10, 10, 10, 10],
            header: ['N', 'R$', 'Dia', 'Quando'],
            rows: [[
                { kind: 'number',
value: 42 },
                { kind: 'money',
value: 1234.5 },
                { kind: 'date',
value: new Date('2026-10-05T00:00:00Z') },
                { kind: 'datetime',
value: new Date('2026-10-05T08:30:00Z') },
            ]],
        })]));
        expect(s.cells.get('A2')).toEqual({ style: 0,
type: null,
value: '42',
formula: false });
        expect(s.cells.get('B2')).toEqual({ style: 3,
type: null,
value: '1234.5',
formula: false });
        expect(s.cells.get('C2')).toEqual({ style: 4,
type: null,
value: '46300',
formula: false });
        expect(s.cells.get('D2')!.style).toBe(5);
        expect(serialToIso(s.cells.get('D2')!.value)).toBe('2026-10-05 08:30');
        const styles = files.get('xl/styles.xml')!;
        expect(styles).toContain('<numFmt numFmtId="164" formatCode="&quot;R$&quot;\\ #,##0.00"/>');
        expect(styles).toContain('<numFmt numFmtId="165" formatCode="dd/mm/yyyy"/>');
        expect(styles).toContain('<numFmt numFmtId="166" formatCode="dd/mm/yyyy\\ hh:mm"/>');
    });

    it('vazio não vira célula; data antes de 1900 vira texto; texto longo é cortado no limite do Excel', () => {
        const { sheets: [s] } = readXlsx(buildXlsx([sheet({
            widths: [10, 10, 10, 10, 10],
            header: ['a', 'b', 'c', 'd', 'e'],
            rows: [[
                null,
                { kind: 'text',
value: '' },
                { kind: 'number',
value: Number.NaN },
                { kind: 'date',
value: new Date('1899-05-01T00:00:00Z') },
                { kind: 'text',
value: 'x'.repeat(40_000) },
            ]],
        })]));
        expect(s.cells.has('A2')).toBe(false);
        expect(s.cells.has('B2')).toBe(false);
        expect(s.cells.has('C2')).toBe(false);
        expect(s.cells.get('D2')).toMatchObject({ style: 2,
value: '01/05/1899' });
        expect(s.cells.get('E2')!.value).toHaveLength(32_767);
    });

    it('acentos, aspas e quebra de linha passam inteiros', () => {
        const value = 'JOÃO "ZÉ" <PAI> & FILHO\nlinha 2  ';
        const { sheets: [s] } = readXlsx(buildXlsx([sheet({ rows: [[{ kind: 'text',
value }]] })]));
        expect(s.cells.get('A2')!.value).toBe(value);
        expect(s.xml).toContain('xml:space="preserve"');
    });
});
