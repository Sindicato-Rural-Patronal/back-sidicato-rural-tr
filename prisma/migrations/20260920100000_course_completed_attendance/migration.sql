-- Status "Concluído" (marcado à mão pela equipe) e presença nas inscrições.
-- O valor novo do enum não é usado nesta migration (Postgres não deixa usar na
-- mesma transação em que foi criado).
ALTER TYPE "CourseStatus" ADD VALUE IF NOT EXISTS 'COMPLETED';

-- null = sem marcar, true = presente, false = faltou. Inscrições antigas ficam sem marcar.
ALTER TABLE "courseUserRegistration" ADD COLUMN IF NOT EXISTS "attended" BOOLEAN;
