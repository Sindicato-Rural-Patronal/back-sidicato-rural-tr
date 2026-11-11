import { crc32, deflateRawSync } from 'node:zlib';

// Planilha do Excel (.xlsx) sem biblioteca (decisão 006, item 4; SR-104): o
// mínimo do OOXML (SpreadsheetML) num ZIP montado com o `node:zlib`.
//
// - Texto é sempre texto: célula `inlineStr`, com o formato "@". Nunca vira
//   fórmula (`<f>`) nem número, então "=HYPERLINK(…)", "+55 44…", "@SUM(…)",
//   "-1+1", telefone, CPF, CNS e CEP saem como foram escritos, sem o `'` do CSV.
// - Número e dinheiro são números; data e data e hora são o número de série do
//   Excel com o formato dd/mm/aaaa (hh:mm), lidos dos campos UTC da `Date`.
// - Colunas com largura e, quando a aba tem cabeçalho, ele fica preso no alto.
//
// Por que não uma biblioteca: o `write-excel-file` passou na licença (MIT), no
// `npm audit` e no ESM, mas levou 10 s e 330 MB para 20.000 linhas × 80
// colunas, travando o servidor; aqui são cerca de 1,5 s. E o `xlsx` (SheetJS)
// do npm está parado e tem alertas (decisão 006).

export type XlsxCell =
    /** `bold`: em negrito (os rótulos da aba "Sobre"). */
    | {
 kind: 'text';
value: string;
bold?: boolean 
}
    | {
 kind: 'number';
value: number 
}
    /** Número com o formato "R$ 1.234,50". */
    | {
 kind: 'money';
value: number 
}
    /** dd/mm/aaaa, dos campos UTC. */
    | {
 kind: 'date';
value: Date 
}
    /** dd/mm/aaaa hh:mm, dos campos UTC. */
    | {
 kind: 'datetime';
value: Date 
}
    | null;

export type XlsxSheet = {
    /** Até 31 caracteres, sem : \ / ? * [ ] (o resto é trocado). */
    name: string;
    /** Largura de cada coluna, em caracteres. */
    widths: number[];
    /** Cabeçalho em negrito e preso no alto ao rolar. Sem ele, nada fica preso. */
    header?: string[];
    rows: XlsxCell[][];
};

export const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** O Excel recusa célula com mais que isso. */
const MAX_CELL_TEXT = 32_767;

// Estilos (`cellXfs` em styles.xml), na ordem.
const STYLE = { general: 0,
header: 1,
text: 2,
money: 3,
date: 4,
datetime: 5 } as const;

const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

// Caracteres que o XML 1.0 não aceita (controle, menos tab, LF e CR).
 
const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

export function xmlEscape(text: string): string {
    return text
        .replace(INVALID_XML, '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** 0 → "A", 25 → "Z", 26 → "AA". */
export function columnName(index: number): string {
    let name = '';
    for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
        name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
    }
    return name;
}

const DAY_MS = 86_400_000;
/** 1899-12-30: o dia zero do Excel (com o 29/02/1900 que não existiu). */
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
/** Antes de 01/03/1900 o número de série do Excel erra um dia: a data sai como texto. */
const FIRST_SAFE_DAY = Date.UTC(1900, 2, 1);

/** O número de série do Excel para os campos UTC da data; null se não dá. */
export function excelSerial(d: Date): number | null {
    const t = d.getTime();
    if (!Number.isFinite(t) || t < FIRST_SAFE_DAY || d.getUTCFullYear() > 9999) return null;
    return (t - EXCEL_EPOCH) / DAY_MS;
}

const pad = (n: number) => String(n).padStart(2, '0');
const dateText = (d: Date) => `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;

function textCell(ref: string, text: string, style: number): string {
    const t = xmlEscape(text.length > MAX_CELL_TEXT ? text.slice(0, MAX_CELL_TEXT) : text);
    return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${t}</t></is></c>`;
}

function cellXml(ref: string, cell: XlsxCell): string {
    if (cell === null) return '';
    switch (cell.kind) {
        case 'text':
            return cell.value === '' ? '' : textCell(ref, cell.value, cell.bold ? STYLE.header : STYLE.text);
        case 'number':
        case 'money':
            if (!Number.isFinite(cell.value)) return '';
            return `<c r="${ref}" s="${cell.kind === 'money' ? STYLE.money : STYLE.general}"><v>${cell.value}</v></c>`;
        case 'date':
        case 'datetime': {
            const serial = excelSerial(cell.value);
            if (serial === null) {
                // Data que o Excel não representa (antes de 1900): vai como texto.
                if (!Number.isFinite(cell.value.getTime())) return '';
                const text = cell.kind === 'date'
                    ? dateText(cell.value)
                    : `${dateText(cell.value)} ${pad(cell.value.getUTCHours())}:${pad(cell.value.getUTCMinutes())}`;
                return textCell(ref, text, STYLE.text);
            }
            const value = cell.kind === 'date' ? Math.floor(serial) : serial;
            return `<c r="${ref}" s="${cell.kind === 'date' ? STYLE.date : STYLE.datetime}"><v>${value}</v></c>`;
        }
    }
}

/** Nome de aba que o Excel aceita: até 31 caracteres, sem : \ / ? * [ ] nem ' nas pontas. */
export function sheetName(name: string, used: Set<string>): string {
    const base = name.replace(/[:\\/?*[\]]/g, '-').replace(/^'+|'+$/g, '').trim().slice(0, 31) || 'Planilha';
    let candidate = base;
    for (let i = 2; used.has(candidate.toLowerCase()); i++) {
        const suffix = ` (${i})`;
        candidate = base.slice(0, 31 - suffix.length) + suffix;
    }
    used.add(candidate.toLowerCase());
    return candidate;
}

function sheetXml(sheet: XlsxSheet, selected: boolean): string {
    const lines: string[] = [];
    let r = 0;
    if (sheet.header) {
        r++;
        lines.push(`<row r="${r}">${sheet.header.map((h, i) => textCell(`${columnName(i)}${r}`, h, STYLE.header)).join('')}</row>`);
    }
    const names = sheet.widths.map((_, i) => columnName(i));
    for (const row of sheet.rows) {
        r++;
        let cells = '';
        for (let i = 0; i < row.length; i++) cells += cellXml(`${names[i] ?? columnName(i)}${r}`, row[i] ?? null);
        lines.push(`<row r="${r}">${cells}</row>`);
    }

    const lastCol = columnName(Math.max(sheet.widths.length, sheet.header?.length ?? 0, 1) - 1);
    const pane = sheet.header
        ? '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/>'
        : '';
    const cols = sheet.widths.length
        ? `<cols>${sheet.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
        : '';
    return XML_HEAD
        + `<worksheet xmlns="${NS_MAIN}" xmlns:r="${NS_REL}">`
        + `<dimension ref="A1:${lastCol}${Math.max(r, 1)}"/>`
        + `<sheetViews><sheetView workbookViewId="0"${selected ? ' tabSelected="1"' : ''}>${pane}</sheetView></sheetViews>`
        + '<sheetFormatPr defaultRowHeight="15"/>'
        + cols
        + `<sheetData>${lines.join('')}</sheetData>`
        + '</worksheet>';
}

const STYLES_XML = XML_HEAD
    + `<styleSheet xmlns="${NS_MAIN}">`
    + '<numFmts count="3">'
    + '<numFmt numFmtId="164" formatCode="&quot;R$&quot;\\ #,##0.00"/>'
    + '<numFmt numFmtId="165" formatCode="dd/mm/yyyy"/>'
    + '<numFmt numFmtId="166" formatCode="dd/mm/yyyy\\ hh:mm"/>'
    + '</numFmts>'
    + '<fonts count="2">'
    + '<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>'
    + '<font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font>'
    + '</fonts>'
    + '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
    + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
    + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    + '<cellXfs count="6">'
    + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
    + '<xf numFmtId="49" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>'
    + '<xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
    + '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
    + '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
    + '<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
    + '</cellXfs>'
    + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
    + '</styleSheet>';

/** Os arquivos do pacote, na ordem do ZIP. */
export function xlsxParts(sheets: XlsxSheet[]): {
 name: string;
data: string 
}[] {
    if (!sheets.length) throw new Error('A planilha precisa de pelo menos uma aba.');
    const used = new Set<string>();
    const names = sheets.map(s => sheetName(s.name, used));
    const sheetPaths = sheets.map((_, i) => `xl/worksheets/sheet${i + 1}.xml`);

    const contentTypes = XML_HEAD
        + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        + '<Default Extension="xml" ContentType="application/xml"/>'
        + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        + sheetPaths.map(p => `<Override PartName="/${p}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
        + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
        + '</Types>';
    const rootRels = XML_HEAD
        + `<Relationships xmlns="${NS_PKG_REL}">`
        + `<Relationship Id="rId1" Type="${NS_REL}/officeDocument" Target="xl/workbook.xml"/>`
        + '</Relationships>';
    const workbook = XML_HEAD
        + `<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}">`
        + '<bookViews><workbookView activeTab="0"/></bookViews>'
        + `<sheets>${names.map((n, i) => `<sheet name="${xmlEscape(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>`
        + '</workbook>';
    const workbookRels = XML_HEAD
        + `<Relationships xmlns="${NS_PKG_REL}">`
        + sheetPaths.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${NS_REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
        + `<Relationship Id="rId${sheets.length + 1}" Type="${NS_REL}/styles" Target="styles.xml"/>`
        + '</Relationships>';

    return [
        { name: '[Content_Types].xml',
data: contentTypes },
        { name: '_rels/.rels',
data: rootRels },
        { name: 'xl/workbook.xml',
data: workbook },
        { name: 'xl/_rels/workbook.xml.rels',
data: workbookRels },
        { name: 'xl/styles.xml',
data: STYLES_XML },
        ...sheets.map((s, i) => ({ name: sheetPaths[i],
data: sheetXml(s, i === 0) })),
    ];
}

/** Data e hora no formato do ZIP (MS-DOS), dos campos UTC. */
function dosDateTime(d: Date): {
 time: number;
date: number 
} {
    const year = Math.min(Math.max(d.getUTCFullYear(), 1980), 2107);
    return {
        time: (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | Math.floor(d.getUTCSeconds() / 2),
        date: ((year - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate(),
    };
}

/** ZIP com os arquivos comprimidos (deflate), sem ZIP64: cada parte e o total abaixo de 4 GB. */
export function zip(files: {
 name: string;
data: string | Buffer 
}[], when: Date = new Date()): Buffer {
    const { time, date } = dosDateTime(when);
    const locals: Buffer[] = [];
    const centrals: Buffer[] = [];
    let offset = 0;
    for (const file of files) {
        const name = Buffer.from(file.name, 'utf8');
        const raw = typeof file.data === 'string' ? Buffer.from(file.data, 'utf8') : file.data;
        const packed = deflateRawSync(raw);
        const crc = crc32(raw);

        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4); // versão para extrair
        local.writeUInt16LE(0x0800, 6); // nomes em UTF-8
        local.writeUInt16LE(8, 8); // deflate
        local.writeUInt16LE(time, 10);
        local.writeUInt16LE(date, 12);
        local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(packed.length, 18);
        local.writeUInt32LE(raw.length, 22);
        local.writeUInt16LE(name.length, 26);
        local.writeUInt16LE(0, 28);
        locals.push(local, name, packed);

        const central = Buffer.alloc(46);
        central.writeUInt32LE(0x02014b50, 0);
        central.writeUInt16LE(20, 4); // feito por
        central.writeUInt16LE(20, 6);
        central.writeUInt16LE(0x0800, 8);
        central.writeUInt16LE(8, 10);
        central.writeUInt16LE(time, 12);
        central.writeUInt16LE(date, 14);
        central.writeUInt32LE(crc, 16);
        central.writeUInt32LE(packed.length, 20);
        central.writeUInt32LE(raw.length, 24);
        central.writeUInt16LE(name.length, 28);
        // extra, comentário, disco, atributos internos e externos: zero
        central.writeUInt32LE(offset, 42);
        centrals.push(central, name);

        offset += local.length + name.length + packed.length;
    }
    const centralSize = centrals.reduce((n, b) => n + b.length, 0);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(files.length, 8);
    end.writeUInt16LE(files.length, 10);
    end.writeUInt32LE(centralSize, 12);
    end.writeUInt32LE(offset, 16);
    return Buffer.concat([...locals, ...centrals, end]);
}

/** O arquivo .xlsx: a primeira aba fica aberta. `when` é a data gravada no ZIP. */
export function buildXlsx(sheets: XlsxSheet[], when: Date = new Date()): Buffer {
    return zip(xlsxParts(sheets), when);
}
