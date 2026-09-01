# Backup & Restore — banco (Supabase Postgres)

Duas abordagens. **Recomendado: A (Supabase gerenciado)**; B é complemento/offsite.

## Opção A — Backups gerenciados do Supabase (recomendado)
No painel do Supabase do projeto:
1. **Database → Backups**: planos pagos têm **PITR (Point-in-Time Recovery)** e backups diários automáticos com retenção. O free tier tem backup diário com retenção curta.
2. Confirme a janela de retenção e faça um **restore de teste** (num projeto de staging) pelo menos uma vez.
3. Sem custo de manutenção nosso — é o caminho mais seguro.

## Opção B — Dump lógico agendado (offsite / redundância)
Script: [`scripts/db-backup.sh`](scripts/db-backup.sh) — roda `pg_dump` e gera `backup-<timestamp>.sql.gz` (mantém os 14 mais recentes).

```sh
# Use a connection string DIRETA/SESSION do Supabase (não o pooler transaction).
DATABASE_URL="postgresql://postgres:...@db.<ref>.supabase.co:5432/postgres" \
  ./scripts/db-backup.sh /caminho/dos/backups
```

### Agendar (Coolify)
- Crie uma **Scheduled Task / cron** no serviço do backend:
  - Comando: `sh scripts/db-backup.sh /data/backups`
  - Frequência: diária (ex.: `0 3 * * *`).
  - Monte um volume persistente em `/data/backups` (senão o dump some no redeploy).
- Requer `postgresql-client` na imagem. A imagem `node:22-alpine` **não** traz `pg_dump`;
  para rodar dentro do container do backend, adicione no Dockerfile do backend:
  `RUN apk add --no-cache postgresql-client`. (Ou rode o script de fora, num host que tenha o client.)
- Opcional offsite: após o dump, subir o `.sql.gz` para um bucket (Supabase Storage/S3) via `curl`/CLI.

## Restore
```sh
# Cuidado: sobrescreve o schema/dados (o dump usa --clean --if-exists).
gunzip -c backup-YYYYMMDD-HHMMSS.sql.gz | psql "postgresql://postgres:...@db.<ref>.supabase.co:5432/postgres"
```
Depois do restore, rode as migrations pendentes se necessário: `npx prisma migrate deploy`.

## Recomendação final
- Ligar **A** já (painel) para cobertura imediata.
- Adicionar **B** (cron + offsite) se quiser cópia fora do Supabase.
- Testar restore periodicamente — backup não testado não é backup.
