-- CAD/PRO: de 1 (text) para até 3 por usuário (text[]). Preserva o valor atual
-- como primeiro elemento; descarta vazios.
ALTER TABLE "UserData" ADD COLUMN "cadPro_arr" TEXT[] NOT NULL DEFAULT '{}';

UPDATE "UserData"
SET "cadPro_arr" = ARRAY["cadPro"]
WHERE "cadPro" IS NOT NULL AND "cadPro" <> '';

ALTER TABLE "UserData" DROP COLUMN "cadPro";
ALTER TABLE "UserData" RENAME COLUMN "cadPro_arr" TO "cadPro";
