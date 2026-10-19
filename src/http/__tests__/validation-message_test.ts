import { describe, it, expect } from 'vitest';
import { validationMessage } from '../validation-message.js';

const FALLBACK = 'Dados inválidos.';

describe('validationMessage (Ajv → português)', () => {
    it.each([
        [{ keyword: 'required',
instancePath: '',
params: { missingProperty: 'name' } }, 'Informe o campo "name".'],
        [{ keyword: 'required',
instancePath: '/address',
params: { missingProperty: 'city' } }, 'Informe o campo "address.city".'],
        [{ keyword: 'type',
instancePath: '/maxCapacity',
params: { type: 'integer' } }, 'Valor inválido em "maxCapacity": esperado número inteiro.'],
        [{ keyword: 'type',
instancePath: '/active',
params: { type: 'boolean' } }, 'Valor inválido em "active": esperado verdadeiro ou falso.'],
        [{ keyword: 'enum',
instancePath: '/status',
params: {} }, 'Valor não aceito em "status".'],
        [{ keyword: 'format',
instancePath: '/email',
params: { format: 'email' } }, 'Formato inválido em "email".'],
        [{ keyword: 'minimum',
instancePath: '/page',
params: { limit: 1 } }, 'Valor menor que o mínimo em "page": 1.'],
        [{ keyword: 'maximum',
instancePath: '/limit',
params: { limit: 1000 } }, 'Valor maior que o máximo em "limit": 1000.'],
        [{ keyword: 'additionalProperties',
instancePath: '',
params: { additionalProperty: 'x' } }, 'Campo não aceito: "x".'],
    ])('%j', (issue, message) => {
        expect(validationMessage([issue], FALLBACK)).toBe(message);
    });

    it('sem erro reconhecível usa o texto padrão, nunca o inglês do Ajv', () => {
        expect(validationMessage([{ keyword: 'oneOf',
message: 'must match exactly one schema' }], FALLBACK)).toBe(FALLBACK);
        expect(validationMessage(undefined, FALLBACK)).toBe(FALLBACK);
    });
});
