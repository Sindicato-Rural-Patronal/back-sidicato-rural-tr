import { crc32, inflateRawSync } from 'node:zlib';

// Leitor mínimo de .xlsx para os testes (unitários e E2E): abre o ZIP pelo
// diretório central, confere o CRC de cada arquivo e lê as células das abas.
// Não é um leitor geral: entende o que `lib/xlsx.ts` escreve.

export type ReadCell = {
    /** O índice do estilo (`s`): 1 cabeçalho, 2 texto, 3 dinheiro, 4 data, 5 data e hora. */
    style: number;
    /** `inlineStr` no texto; ausente no número. */
    type: string | null;
    /** O texto da célula de texto, ou o número como escrito em `<v>`. */
    value: string;
    /** Há `<f>` (fórmula) na célula? */
    formula: boolean;
};

export type ReadSheet = {
    name: string;
    xml: string;
    /** Por referência: "A1", "B2"… */
    cells: Map<string, ReadCell>;
    /** As linhas como texto (célula ausente = ""), para comparar tabelas. */
    rows: string[][];
};

export function unzip(buf: Buffer): Map<string, Buffer> {
    const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    if (end < 0) throw new Error('ZIP sem o fim do diretório central');
    const count = buf.readUInt16LE(end + 10);
    let p = buf.readUInt32LE(end + 16);
    const files = new Map<string, Buffer>();
    for (let i = 0; i < count; i++) {
        if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error(`diretório central inválido no arquivo ${i}`);
        const method = buf.readUInt16LE(p + 10);
        const crc = buf.readUInt32LE(p + 16);
        const packedSize = buf.readUInt32LE(p + 20);
        const size = buf.readUInt32LE(p + 24);
        const nameLength = buf.readUInt16LE(p + 28);
        const extra = buf.readUInt16LE(p + 30);
        const comment = buf.readUInt16LE(p + 32);
        const localOffset = buf.readUInt32LE(p + 42);
        const name = buf.subarray(p + 46, p + 46 + nameLength).toString('utf8');
        if (buf.readUInt32LE(localOffset) !== 0x04034b50) throw new Error(`cabeçalho local inválido em ${name}`);
        const localName = buf.readUInt16LE(localOffset + 26);
        const localExtra = buf.readUInt16LE(localOffset + 28);
        const start = localOffset + 30 + localName + localExtra;
        const packed = buf.subarray(start, start + packedSize);
        const data = method === 8 ? inflateRawSync(packed) : Buffer.from(packed);
        if (data.length !== size) throw new Error(`tamanho errado em ${name}`);
        if (crc32(data) !== crc) throw new Error(`CRC errado em ${name}`);
        files.set(name, data);
        p += 46 + nameLength + extra + comment;
    }
    return files;
}

const unescape = (s: string) =>
    s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

const colIndex = (letters: string) => [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

function readSheet(name: string, xml: string): ReadSheet {
    const cells = new Map<string, ReadCell>();
    const rows: string[][] = [];
    for (const m of xml.matchAll(/<c r="([A-Z]+)(\d+)"([^>]*)>([\s\S]*?)<\/c>/g)) {
        const [, col, row, attrs, inner] = m;
        const style = Number(/ s="(\d+)"/.exec(attrs)?.[1] ?? 0);
        const type = / t="(\w+)"/.exec(attrs)?.[1] ?? null;
        const text = /<t[^>]*>([\s\S]*?)<\/t>/.exec(inner)?.[1];
        const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
        const value = unescape(text ?? v ?? '');
        cells.set(`${col}${row}`, { style,
type,
value,
formula: inner.includes('<f') });
        const r = Number(row) - 1;
        const c = colIndex(col);
        while (rows.length <= r) rows.push([]);
        while (rows[r].length < c) rows[r].push('');
        rows[r][c] = value;
    }
    return { name,
xml,
cells,
rows };
}

/** Abre o .xlsx: os arquivos do pacote e as abas, na ordem do workbook. */
export function readXlsx(buf: Buffer): {
 files: Map<string, string>;
sheets: ReadSheet[] 
} {
    const raw = unzip(buf);
    const files = new Map([...raw].map(([k, v]) => [k, v.toString('utf8')]));
    const workbook = files.get('xl/workbook.xml') ?? '';
    const names = [...workbook.matchAll(/<sheet name="([^"]*)" sheetId="(\d+)"/g)].map(m => unescape(m[1]));
    const sheets = names.map((n, i) => readSheet(n, files.get(`xl/worksheets/sheet${i + 1}.xml`) ?? ''));
    return { files,
sheets };
}

/** Número de série do Excel → "AAAA-MM-DD hh:mm" (UTC), para conferir datas. */
export function serialToIso(serial: string | number): string {
    const ms = Math.round((Number(serial) * 86_400_000 + Date.UTC(1899, 11, 30)) / 1000) * 1000;
    return new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
}
