-- Dedup defensivo: soft-delete inscrições ativas duplicadas (mesmo curso+usuário),
-- mantendo a mais antiga. Evita falha ao criar o índice único parcial abaixo.
UPDATE "courseUserRegistration" c
SET "isDeleted" = true, "deletedAt" = now()
WHERE c."isDeleted" = false
  AND EXISTS (
    SELECT 1 FROM "courseUserRegistration" o
    WHERE o."courseId" = c."courseId"
      AND o."userDataId" = c."userDataId"
      AND o."isDeleted" = false
      AND (o."createdAt" < c."createdAt"
           OR (o."createdAt" = c."createdAt" AND o."id" < c."id"))
  );

-- No máximo uma inscrição ATIVA por (curso, usuário). Linhas soft-deletadas
-- ficam de fora, então reinscrição após cancelamento continua permitida.
CREATE UNIQUE INDEX "courseUserRegistration_courseId_userDataId_active_key"
    ON "courseUserRegistration" ("courseId", "userDataId")
    WHERE "isDeleted" = false;
