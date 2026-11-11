import type { ExportAddress, ExportProperty } from '../../ports/external/export-repository.js';
import { stripAccents } from '../../lib/text.js';

// Formatação compartilhada pelas exportações.

// CPF sempre como 000.000.000-00 (gravado só com dígitos). Valor antigo que não
// tem 11 dígitos sai só com os dígitos, sem máscara pela metade.
export function formatCpf(cpf: string | null | undefined): string {
    if (!cpf) return '';
    const d = cpf.replace(/\D/g, '');
    return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : d;
}

export function formatCnpj(cnpj: string | null | undefined): string {
    if (!cnpj) return '';
    const d = cnpj.replace(/\D/g, '');
    return d.length === 14 ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}` : cnpj;
}

export function formatCep(cep: string | null | undefined): string {
    if (!cep) return '';
    const d = cep.replace(/\D/g, '');
    return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : cep;
}

/**
 * Telefone com DDD: "(44) 99999-8888" ou "(44) 3645-1234". Com máscara o Excel
 * não transforma o número em "4,5E+10". Outro tamanho (com +55, ramal…) sai
 * como foi gravado.
 */
export function formatPhone(phone: string | null | undefined): string {
    if (!phone) return '';
    const d = phone.replace(/\D/g, '');
    if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return phone;
}

/** Cartão Nacional de Saúde: "000 0000 0000 0000". Outro tamanho sai como gravado. */
export function formatCns(cns: string | null | undefined): string {
    if (!cns) return '';
    const d = cns.replace(/\D/g, '');
    return d.length === 15 ? `${d.slice(0, 3)} ${d.slice(3, 7)} ${d.slice(7, 11)} ${d.slice(11)}` : cns;
}

/** Endereço numa linha: "Rua X, 10 - Centro - Terra Roxa/PR - 85990-000". */
export function addressLine(a: ExportAddress | null | undefined): string {
    if (!a) return '';
    const street = [a.street ?? a.road, a.number].filter(Boolean).join(', ');
    const rural = [a.localityName, a.km && `km ${a.km}`, a.lot && `lote ${a.lot}`, a.section && `seção ${a.section}`]
        .filter(Boolean)
        .join(', ');
    const city = [a.city, a.state].filter(Boolean).join('/');
    return [street, a.complement, a.neighborhood, rural, city, formatCep(a.zipCode)].filter(Boolean).join(' - ');
}

export function propertyLine(p: ExportProperty): string {
    const name = p.registration ? `${p.name} (matrícula ${p.registration})` : p.name;
    const where = addressLine(p.address);
    return where ? `${name}: ${where}` : name;
}

export function ymd(d: Date): string {
    return d.toISOString().slice(0, 10);
}

/** Associado em dia: ativo e com validade em branco ou de hoje em diante. */
export function isActiveMember(status: string | null, validUntil: Date | null, today: Date): boolean {
    if (status !== 'ACTIVE') return false;
    return !validUntil || ymd(validUntil) >= ymd(today);
}

/** Idade em anos completos na data de hoje. */
export function ageOn(birth: Date | null, today: Date): number | null {
    if (!birth) return null;
    let age = today.getUTCFullYear() - birth.getUTCFullYear();
    const beforeBirthday =
        today.getUTCMonth() < birth.getUTCMonth() ||
        (today.getUTCMonth() === birth.getUTCMonth() && today.getUTCDate() < birth.getUTCDate());
    if (beforeBirthday) age -= 1;
    return age;
}

export function slug(value: string): string {
    return stripAccents(value)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 50);
}
