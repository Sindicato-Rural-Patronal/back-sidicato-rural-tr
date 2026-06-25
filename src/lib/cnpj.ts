export function isValidCnpj(raw: string): boolean {
    const digits = raw.replace(/\D/g, '');
    if (digits.length !== 14) return false;
    if (/^(\d)\1{13}$/.test(digits)) return false;

    const calc = (factor: number[]) => {
        let sum = 0;
        for (let i = 0; i < factor.length; i++) {
            sum += parseInt(digits[i]) * factor[i];
        }
        const rem = sum % 11;
        return rem < 2 ? 0 : 11 - rem;
    };

    const d1 = calc([5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    if (d1 !== parseInt(digits[12])) return false;

    const d2 = calc([6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    return d2 === parseInt(digits[13]);
}
