#!/usr/bin/env sh
# Backup lógico do banco via pg_dump. Uso:
#   DATABASE_URL="postgresql://..." ./scripts/db-backup.sh [dir_destino]
#
# Requer `pg_dump` (client do PostgreSQL) instalado.
# IMPORTANTE: use a connection string DIRETA/SESSION do Supabase (não o pooler
# transaction/pgbouncer) — pg_dump precisa de uma sessão real.
set -eu

: "${DATABASE_URL:?defina DATABASE_URL (connection string direta/session do Supabase)}"

DEST="${1:-.}"
mkdir -p "$DEST"
TS="$(date +%Y%m%d-%H%M%S)"
OUT="$DEST/backup-${TS}.sql.gz"

echo "Gerando backup em $OUT ..."
pg_dump "$DATABASE_URL" --no-owner --no-privileges --clean --if-exists | gzip > "$OUT"
echo "OK: $OUT ($(du -h "$OUT" | cut -f1))"

# Retenção opcional: mantém os 14 backups mais recentes no destino.
ls -1t "$DEST"/backup-*.sql.gz 2>/dev/null | tail -n +15 | xargs -r rm -f || true
