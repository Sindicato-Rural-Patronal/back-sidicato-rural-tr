// Confere o telefone que a pessoa digita no site com os três do cadastro
// (phone, phone2, phone3), para a consulta e a inscrição por CPF (SR-025).
// Compara só os dígitos: cadastros antigos têm máscara, e o DDI 55 não conta.

/** Só os dígitos, sem o DDI 55 (quando o número tem 12 ou 13 dígitos). */
export function phoneDigits(raw: string | null | undefined): string {
    const digits = (raw ?? '').replace(/\D/g, '');
    if (digits.length >= 12 && digits.startsWith('55')) return digits.slice(2);
    return digits;
}

/** Os 4 últimos dígitos digitados, ou null se não forem exatamente 4. */
export function parsePhoneEnd(raw: string): string | null {
    const digits = raw.replace(/\D/g, '');
    return digits.length === 4 ? digits : null;
}

type Phones = {
    phone: string | null;
    phone2: string | null;
    phone3: string | null;
};

const phonesOf = (p: Phones) => [p.phone, p.phone2, p.phone3].map(phoneDigits).filter(d => d.length >= 4);

/** Algum telefone do cadastro termina nesses 4 dígitos. */
export function phoneEndMatches(person: Phones, end: string): boolean {
    return phonesOf(person).some(d => d.endsWith(end));
}

/**
 * Quantos dígitos do fim têm de bater no telefone completo. Oito ignoram o DDD
 * (cadastro antigo sem ele) e o nono dígito do celular (cadastro de antes de
 * 2016 com 8 dígitos), mas continuam sendo o número da pessoa.
 */
export const FULL_PHONE_MATCH_DIGITS = 8;

/** O telefone digitado é um dos do cadastro, pelos últimos 8 dígitos. */
export function phoneMatches(person: Phones, typed: string): boolean {
    const digits = phoneDigits(typed);
    if (digits.length < FULL_PHONE_MATCH_DIGITS) return false;
    const end = digits.slice(-FULL_PHONE_MATCH_DIGITS);
    return phonesOf(person).some(d => d.length >= FULL_PHONE_MATCH_DIGITS && d.slice(-FULL_PHONE_MATCH_DIGITS) === end);
}
