import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListCourseRegistrationsUseCase } from '../list-course-registrations.js';
import type { RegistrationRepository } from '../../ports/external/registration-repository.js';

const mockRegistrationRepo = {
    create: vi.fn(),
    findById: vi.fn(),
    findByCourseId: vi.fn(),
    findByUserDataAndCourse: vi.fn(),
    delete: vi.fn(),
} as unknown as RegistrationRepository;

describe('ListCourseRegistrationsUseCase', () => {
    beforeEach(() => vi.clearAllMocks());

    describe('listagem de inscrições', () => {
        it('retorna inscrições do curso', async () => {
            const fakeRegs = [{ id: 'reg-001',
userData: { name: 'João' } }];
            vi.mocked(mockRegistrationRepo.findByCourseId).mockResolvedValue(fakeRegs as any);
            const uc = new ListCourseRegistrationsUseCase(mockRegistrationRepo);
            const result = await uc.execute('course-001');
            expect(result.error).toBeUndefined();
            expect(result.registrations).toHaveLength(1);
        });

        it('retorna lista vazia se não há inscrições', async () => {
            vi.mocked(mockRegistrationRepo.findByCourseId).mockResolvedValue([]);
            const uc = new ListCourseRegistrationsUseCase(mockRegistrationRepo);
            const result = await uc.execute('course-001');
            expect(result.registrations).toHaveLength(0);
        });
    });
});
