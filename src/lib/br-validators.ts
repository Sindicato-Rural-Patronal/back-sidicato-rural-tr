/** Brazilian phone: DDD (2 digits) + number (8-9 digits) = 10-11 digits total */
export function isValidBrPhone(raw: string): boolean {
    const digits = raw.replace(/\D/g, '');
    return digits.length === 10 || digits.length === 11;
}

/** RG: 7-9 digits (varies by state) */
export function isValidRg(raw: string): boolean {
    const digits = raw.replace(/\D/g, '');
    return digits.length >= 7 && digits.length <= 9;
}

/** CNH (driver license): exactly 11 digits */
export function isValidCnh(raw: string): boolean {
    const digits = raw.replace(/\D/g, '');
    if (digits.length !== 11) return false;
    if (/^(\d)\1{10}$/.test(digits)) return false;
    return true;
}
