export function isValidCpf(raw: string): boolean {
    const digits = raw.replace(/\D/g, '');
    if (digits.length !== 11) return false;
    if (/^(\d)\1{10}$/.test(digits)) return false;

    const calc = (factor: number) => {
        let sum = 0;
        for (let i = 0; i < factor - 1; i++) {
            sum += parseInt(digits[i]) * (factor - i);
        }
        const rem = (sum * 10) % 11;
        return rem >= 10 ? 0 : rem;
    };

    return calc(10) === parseInt(digits[9]) && calc(11) === parseInt(digits[10]);
}
