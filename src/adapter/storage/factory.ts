import type { StorageRepository } from '../../ports/external/storage-repository.js';
import { SupabaseStorageAdapter } from './supabase-storage.js';

export function createStorageAdapter(): StorageRepository {
    return new SupabaseStorageAdapter();
}
