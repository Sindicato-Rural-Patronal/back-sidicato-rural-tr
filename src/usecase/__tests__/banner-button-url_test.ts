import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateBannerUseCase } from '../create-banner.js';
import { UpdateBannerUseCase } from '../update-banner.js';
import type { BannerRepository } from '../../ports/external/banner-repository.js';
import { ValidationError } from '../../errors/validation.js';

const repo = {
    findById: vi.fn(),
    findMaxOrder: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
} as unknown as BannerRepository;

const withButton = (url: string) => ({ title: 'BANNER',
buttons: [{ label: 'SAIBA MAIS',
url }] });

// O link do botão sai num <a href> da home, que é pública.
describe('link do botão do banner', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(repo.findMaxOrder).mockResolvedValue(0);
        vi.mocked(repo.create).mockImplementation(async data => ({ id: 'b1',
...data }) as never);
        vi.mocked(repo.findById).mockResolvedValue({ id: 'b1' } as never);
        vi.mocked(repo.update).mockImplementation(async (id, data) => ({ id,
...data }) as never);
    });

    it.each(['/cursos', '/', '#contato', 'https://faep.com.br/agenda', 'http://exemplo.com'])('aceita %s', async url => {
        const create = await new CreateBannerUseCase(repo).execute(withButton(url));
        expect(create.error).toBeUndefined();
        const update = await new UpdateBannerUseCase(repo).execute('b1', withButton(url));
        expect(update.error).toBeUndefined();
    });

    it.each([
        'javascript:alert(1)',
        'JavaScript:alert(1)',
        'data:text/html,<script>alert(1)</script>',
        'vbscript:msgbox(1)',
        '//outro.site/pagina',
        'https://',
        'faep.com.br',
    ])('recusa %s', async url => {
        const create = await new CreateBannerUseCase(repo).execute(withButton(url));
        expect(create.error).toBeInstanceOf(ValidationError);
        expect(create.error?.message).toMatch(/Link do botão/);
        expect(repo.create).not.toHaveBeenCalled();

        const update = await new UpdateBannerUseCase(repo).execute('b1', withButton(url));
        expect(update.error).toBeInstanceOf(ValidationError);
        expect(repo.update).not.toHaveBeenCalled();
    });

    it('guarda o link sem os espaços das pontas', async () => {
        await new CreateBannerUseCase(repo).execute(withButton('  /cursos  '));
        expect(vi.mocked(repo.create).mock.calls[0][0].buttons?.[0]?.url).toBe('/cursos');
    });
});
