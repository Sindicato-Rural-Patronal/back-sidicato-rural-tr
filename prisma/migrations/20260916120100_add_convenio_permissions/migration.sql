-- Permissões do módulo de Convênios. Em migration própria: valores novos de enum
-- só podem ser usados depois que a transação que os criou é confirmada.
ALTER TYPE "Permission" ADD VALUE IF NOT EXISTS 'CREATE_CONVENIO';
ALTER TYPE "Permission" ADD VALUE IF NOT EXISTS 'UPDATE_CONVENIO';
ALTER TYPE "Permission" ADD VALUE IF NOT EXISTS 'DELETE_CONVENIO';
ALTER TYPE "Permission" ADD VALUE IF NOT EXISTS 'READ_CONVENIO';
