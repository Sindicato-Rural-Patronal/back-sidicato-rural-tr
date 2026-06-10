# back-sindicato-rural-tr

Backend REST para o sistema de gestão do Sindicato Rural. Gerencia trabalhadores, administradores, cursos, inscrições e notícias.

## Stack

- **Node.js + TypeScript** (ESM)
- **Fastify v5** — framework HTTP
- **Prisma 7 + PostgreSQL** — banco de dados
- **JWT + bcrypt** — autenticação
- **AWS S3 / MinIO** — storage de arquivos
- **Zod** — validação de schemas e variáveis de ambiente
- **Vitest** — testes unitários

## Pré-requisitos

- Node.js 20+
- PostgreSQL
- MinIO (desenvolvimento) ou conta AWS S3 (produção)

## Configuração

Copie `.env.example` para `.env` e preencha:

```env
DATABASE_URL=postgresql://user:pass@localhost:5432/sindicato
JWT_SECRET=sua-chave-secreta-com-minimo-32-caracteres
PORT=3000
NODE_ENV=development
STORAGE_TYPE=minio
MINIO_ENDPOINT=http://localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
STORAGE_BUCKET=avatars
BANNER_BUCKET=course-banners
```

## Instalação e execução

```bash
npm install
npm run prisma:migrate     # aplicar migrations
npm run prisma:generate    # gerar tipos do Prisma
npm run dev                # hot reload com tsx watch
```

## Comandos

```bash
npm run dev            # desenvolvimento com hot reload
npm run build          # compilar TypeScript
npm run start          # iniciar build compilado
npm test               # rodar testes (Vitest)
npm run prisma:migrate # criar/aplicar migrations
npm run prisma:generate# regenerar tipos do Prisma
npm run prisma:studio  # interface visual do banco
```

## Documentação interativa (Swagger)

Disponível em `http://localhost:3000/docs` após iniciar o servidor.

Para testar rotas protegidas: faça login em `POST /auth/login`, copie o token retornado e clique em **Authorize** no topo do Swagger UI.

## Inicialização automática

Na primeira execução, o servidor cria automaticamente:

1. Regra `SUPER_RULE` com todas as permissões
2. `UserData` do administrador principal (`eduardofrnkdev@gmail.com`)
3. `UserAdmin` com `username: admin` / `password: admin` (alterar em produção)

## Rotas principais

| Grupo | Rotas |
|-------|-------|
| Auth | `POST /auth/login` |
| Usuários | `POST /users`, `GET /admin/users`, `PATCH /users/:id`, `DELETE /users/:id` |
| Administradores | `GET /admin/me`, `GET /admin/users/admins`, `POST /admin/users`, `PATCH /admin/users/:id`, `DELETE /admin/users/:id` |
| Cursos (público) | `GET /courses`, `GET /courses/:courseId` |
| Cursos (admin) | `POST /courses`, `PATCH /courses/:courseId`, `DELETE /courses/:courseId`, `GET /admin/courses`, `GET /admin/courses/:courseId` |
| Mídias de cursos | `POST /courses/:courseId/banner`, `POST /courses/:courseId/gallery`, `DELETE /courses/:courseId/gallery/:photoId` |
| Salas | `GET /rooms`, `POST /rooms` |
| Inscrições | `POST /courses/:courseId/register`, `GET /admin/courses/:courseId/registrations`, `DELETE /admin/registrations/:registrationId` |
| Notícias (público) | `GET /news`, `GET /news/:newsId` |
| Notícias (admin) | `POST /news`, `PATCH /news/:newsId`, `DELETE /news/:newsId`, `GET /admin/news` |
| Mídias de notícias | `POST /news/:newsId/banner`, `POST /news/:newsId/image` |
| Regras | `GET /admin/rules`, `POST /rules`, `PATCH /rules/:ruleId` |
| Dashboard | `GET /admin/dashboard/stats` |

## Testes

```bash
npm test
```

101 testes unitários cobrindo todos os use cases. Os testes usam repositórios em memória (sem banco real).

## Arquitetura

Segue o padrão Hexagonal (Ports & Adapters):

```
src/
  errors/          — classes de erro tipadas por categoria
  http/
    controllers/   — recebem request/reply, delegam ao use case
    router/        — registram rotas Fastify com schemas Swagger
    lib/           — requirePermission, requireAuth, errorToStatus
  usecase/         — lógica de negócio pura
  ports/external/  — interfaces dos repositórios
  adapter/
    database/      — implementações Prisma
    storage/       — S3 e MinIO
```
