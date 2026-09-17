import { describe, it, expect } from 'vitest';
import { companySchema } from '../company-schema.js';
import { galleryAlbumSchema } from '../gallery-usecases.js';
import { upperNoAccents } from '../../lib/text.js';

describe('links só http(s)', () => {
    it('recusa javascript: e data:, aceita https', () => {
        expect(companySchema.safeParse({ name: 'X',
website: 'javascript:alert(1)' }).success).toBe(false);
        expect(companySchema.safeParse({ name: 'X',
partnerUrl: 'data:text/html,oi' }).success).toBe(false);
        expect(companySchema.safeParse({ name: 'X',
website: 'https://agro.com.br' }).success).toBe(true);
        expect(galleryAlbumSchema.safeParse({ title: 'FAEP',
linkUrl: 'javascript:void(0)' }).success).toBe(false);
        expect(galleryAlbumSchema.safeParse({ title: 'FAEP',
linkUrl: 'http://faep.com.br' }).success).toBe(true);
    });
});

describe('upperNoAccents', () => {
    it('maiúsculo, sem acento e sem espaço sobrando', () => {
        expect(upperNoAccents('  sócio   gerente ')).toBe('SOCIO GERENTE');
    });
});
