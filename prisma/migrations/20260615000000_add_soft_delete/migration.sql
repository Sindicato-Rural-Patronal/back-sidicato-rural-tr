-- Add soft delete fields to all entities that have delete operations

ALTER TABLE "UserData" ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "UserData" ADD COLUMN "deletedAt" TIMESTAMP(3);

ALTER TABLE "UserAdmin" ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "UserAdmin" ADD COLUMN "deletedAt" TIMESTAMP(3);

ALTER TABLE "course" ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "course" ADD COLUMN "deletedAt" TIMESTAMP(3);

ALTER TABLE "CoursePhoto" ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CoursePhoto" ADD COLUMN "deletedAt" TIMESTAMP(3);

ALTER TABLE "courseUserRegistration" ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "courseUserRegistration" ADD COLUMN "deletedAt" TIMESTAMP(3);

ALTER TABLE "News" ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "News" ADD COLUMN "deletedAt" TIMESTAMP(3);

ALTER TABLE "Property" ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Property" ADD COLUMN "deletedAt" TIMESTAMP(3);

ALTER TABLE "UserRelation" ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "UserRelation" ADD COLUMN "deletedAt" TIMESTAMP(3);
