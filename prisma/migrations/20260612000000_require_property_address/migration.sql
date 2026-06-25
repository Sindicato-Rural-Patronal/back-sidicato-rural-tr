-- Remove properties with no addressId (dev data safety)
DELETE FROM "Property" WHERE "addressId" IS NULL;

-- Make addressId NOT NULL
ALTER TABLE "Property" ALTER COLUMN "addressId" SET NOT NULL;

-- Add updatedAt column
ALTER TABLE "Property" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
