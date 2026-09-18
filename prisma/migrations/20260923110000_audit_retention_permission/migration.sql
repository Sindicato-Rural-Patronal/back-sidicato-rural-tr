-- Permissão para configurar a trilha de auditoria (tempo de guarda dos registros).
-- Em migration própria: um valor novo de enum só pode ser usado depois que a
-- transação que o criou é confirmada (a concessão às regras vai na seguinte).
ALTER TYPE "Permission" ADD VALUE IF NOT EXISTS 'UPDATE_AUDIT';
