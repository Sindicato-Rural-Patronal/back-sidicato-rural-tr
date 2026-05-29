import { StorageRepository } from "../../ports/external/storage-repository";
import { MinioStorageAdapter } from "./minio-storage-dev";
import { S3StorageAdapter } from "./s3-storage";



export function createStorageAdapter(): StorageRepository {
  const type = process.env.STORAGE_TYPE || "minio";
  switch (type) {
    case "s3":
      return new S3StorageAdapter();
    case "minio":
      return new MinioStorageAdapter();
    default:
      throw new Error(`Invalid STORAGE_TYPE: ${type}`);
  }
}