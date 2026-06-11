import type { PropertyRepository } from '../ports/external/property-repository.js';
import { PropertyNotFoundError } from '../errors/not-found.js';

type DeletePropertyResponse = { error?: Error };

export class DeletePropertyUseCase {
    constructor(private readonly propertyRepository: PropertyRepository) {}

    async execute(propertyId: string): Promise<DeletePropertyResponse> {
        console.log(`[DeleteProperty] propertyId="${propertyId}"`);
        const existing = await this.propertyRepository.findById(propertyId);
        if (!existing) return { error: new PropertyNotFoundError() };
        await this.propertyRepository.delete(propertyId);
        console.log(`[DeleteProperty] success propertyId="${propertyId}"`);
        return {};
    }
}
