# back-sindicato-rural-tr

API do Sindicato Rural de Terra Roxa: pessoas e empresas, administradores e permissões, cursos e inscrições, salas e reservas, notícias e conteúdo do site, cotações, Unimed e convênios, financeiro, auditoria e notificações do painel.

| Onde está | O quê |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | **Contrato da API**: rotas, permissões, corpos, respostas, erros, modelos e convenções. É a referência do front. |
| `http://localhost:3000/docs` | Swagger: cada rota com os schemas. Em produção, só com `ENABLE_DOCS=true`. |
| [`HISTORICO.md`](HISTORICO.md) | O que mudou e por quê (migrations de dados, correções). |
| [`BACKUP.md`](BACKUP.md) | Backup e restore do banco. |

Este README só explica como subir, testar e publicar.

## Stack

- Node.js 22 e TypeScript (ESM).
- Fastify 5.
- Prisma 7 com `@prisma/adapter-pg` (PostgreSQL).
- JWT e bcrypt.
- Zod.
- sharp.
- Supabase Storage.
- Vitest.

## Rodar localmente

1. **Dependências:** `npm ci`.
2. **Variáveis:** copie `.env.example` para `.env` e preencha. Obrigatórias: `DATABASE_URL` e `JWT_SECRET` (32+ caracteres).
   - Sem `SUPABASE_URL`/`SUPABASE_SECRET_KEY` o servidor sobe, mas os uploads falham.
   - Os buckets `avatars`, `course-banners` e `news-banners` precisam existir no Supabase e ser públicos.
   - A lista completa está no `CLAUDE.md`.
3. **Banco:** com o Postgres de `DATABASE_URL` de pé, rode `npx prisma migrate deploy` e `npm run prisma:generate`.
4. **Primeiro admin:** o servidor **não** cria admin nem regra sozinho.
   - Num banco local, rode `npx tsx src/scripts/seed-local-e2e.ts`, que recusa banco que não seja local. Ele cria uma regra com todas as permissões, o admin de teste (credenciais em `src/e2e/helpers/db.ts`) e pessoas de exemplo.
   - Em outro ambiente, o primeiro admin é inserido à mão: `Rule` com todas as permissões, `UserData` e `UserAdmin` com hash bcrypt.
5. **Subir:** `npm run dev` (hot reload). A API fica em `http://localhost:3000`.

```bash
npm run dev               # desenvolvimento (tsx watch)
npm run build             # compila para dist/
npm run start             # roda o build
npm run lint              # ESLint
npx tsc --noEmit          # tipos
npm run prisma:migrate    # cria/aplica migration (dev)
npm run prisma:generate   # regenera o client do Prisma
npm run prisma:studio     # interface do banco
```

## Testes

```bash
npm run test:run          # unitários (src/**/__tests__)
npm run test:e2e          # E2E contra um Postgres local
```

Os E2E apagam e recriam as tabelas.
- O setup só aceita banco em `localhost`, aplica as migrations e limpa os dados entre os arquivos.
- O banco vem do `DATABASE_TEST_URL` do comando ou, sem ele, do `.env.test` (veja o `.env.test.example`).
- Para rodar num banco só seu:

  ```bash
  DATABASE_TEST_URL=postgresql://USER:SENHA@localhost:PORTA/SEU_BANCO npm run test:e2e
  ```

## CI

O `.github/workflows/ci.yml` roda a cada push e PR em `main` e `staging`, com Postgres 16:
- lint e tsc;
- testes unitários;
- **Schema × migrations**: aplica as migrations num banco vazio e compara com o `schema.prisma`. Qualquer diferença deixa o CI vermelho;
- E2E.

## Deploy

- O `Dockerfile` faz o build e, ao subir o container, roda `npx prisma migrate deploy` antes do servidor. Migration que falha derruba o deploy.
- Banco e storage são externos (Supabase).
- `docker-compose.prod.yml` sobe só a API (build local com `--build`); `docker-compose.yaml` é o equivalente para teste local.
- Não há workflow que publique imagem.

## Scripts de manutenção

| Script | O que faz |
|---|---|
| `scripts/db-backup.sh` | `pg_dump` compactado. Veja o `BACKUP.md`. |
| `prisma/limpeza-inicial.sql` | Zera o banco mantendo um admin escolhido. Não tem desfazer. |
| `src/scripts/seed-local-e2e.ts` | Dados de exemplo num banco **local**. |
| `src/scripts/normalize-uppercase.ts` | Normalização antiga, de uma vez só. **Não rode de novo**: tiraria o acento de títulos de curso, notícia e banner, que hoje guardam acento. |
