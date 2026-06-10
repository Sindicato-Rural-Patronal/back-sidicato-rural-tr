# CLAUDE.md — back-sindicato-rural-tr

Backend de um **Sindicato Rural** para gerenciar usuários trabalhadores, administradores, regras de permissão, cursos e notícias.

## Stack

- **Runtime**: Node.js + TypeScript (ESM — `"type": "module"`)
- **Framework HTTP**: Fastify v5 + `@fastify/multipart` (upload de arquivos)
- **ORM**: Prisma 7 com driver `@prisma/adapter-pg` (PostgreSQL nativo)
- **Auth**: JWT (`jsonwebtoken`) + bcrypt para hash de senhas
- **Storage**: AWS S3 (produção) ou MinIO (desenvolvimento)
- **Validação de env**: Zod — falha na inicialização se variáveis estiverem faltando
- **Dev**: `tsx watch` para hot reload

## Variáveis de ambiente (.env)

```
DATABASE_URL=
JWT_SECRET=               # mínimo 32 caracteres
PORT=3000
NODE_ENV=development
STORAGE_TYPE=minio        # minio | s3
MINIO_ENDPOINT=
MINIO_ACCESS_KEY=
MINIO_SECRET_KEY=
STORAGE_BUCKET=avatars
BANNER_BUCKET=course-banners
```

## Arquitetura (Hexagonal / Ports & Adapters)

```
src/
  index.ts                    — entry point, registra plugins e inicializa dados
  config/env.ts               — valida e exporta variáveis de ambiente com Zod
  lib/
    prisma.ts                 — factory do PrismaClient com adapter PrismaPg
    auth.ts                   — decodeToken (jwt.verify wrapper)
  errors/
    auth.ts                   — AuthError (base) + InvalidCredentialsError
    business-rule.ts          — BusinessRuleError (base) + RoomAlreadyBookedError, RegistrationsUnavailableError
    conflict.ts               — ConflictError (base) + 6 erros específicos de conflito
    not-found.ts              — NotFoundError (base) + 11 erros específicos de not found
    validation.ts             — ValidationError (aceita msg do Zod — único com parâmetro)
  http/
    controllers/              — recebem FastifyRequest/Reply, delegam ao use case
    router/                   — registram rotas como plugins Fastify
    lib/
      require-permission.ts   — requirePermission, requireAuth, errorToStatus
  usecase/                    — lógica de negócio pura (sem Fastify, sem Prisma direto)
  ports/external/             — interfaces TypeScript dos repositórios
  adapter/
    database/                 — implementações Prisma das interfaces de repositório
    storage/                  — S3 e MinIO, selecionados via factory
  generated/prisma/           — tipos gerados pelo Prisma (não editar)
```

## Modelos de dados

| Modelo                   | Campos principais                                                                                          |
|--------------------------|------------------------------------------------------------------------------------------------------------|
| `UserData`               | id, name, email, phone, cpf, cnpj, avatar                                                                  |
| `UserAdmin`              | id, username, passwordHash, userDataId (FK), rulesId (FK)                                                  |
| `Rule`                   | id, name, description, permitions (String[])                                                               |
| `Course`                 | id, name, description, roomId (FK), startTime, endTime, status, price, workloadHours, coverImage, eventNumber, minStudents, preEnrolled, waitlist, registrationDeadline, observations |
| `Room`                   | id, name, description, maxCapacity                                                                         |
| `News`                   | id, title, content, summary, bannerUrl, status, publishedAt                                                |
| `CoursePhoto`            | id, courseId (FK), url, caption                                                                            |
| `CourseUserRegistration` | id, courseId (FK), userDataId (FK)                                                                         |

## Permissões disponíveis (em `Rule.permitions`)

```
CREATE_USER    UPDATE_USER    DELETE_USER    READ_USER
CREATE_COURSE  UPDATE_COURSE  DELETE_COURSE  READ_COURSE
CREATE_RULE    UPDATE_RULE    DELETE_RULE    READ_RULE
CREATE_USER_ADMIN  UPDATE_USER_ADMIN  DELETE_USER_ADMIN  READ_USER_ADMIN
CREATE_NEWS    UPDATE_NEWS    DELETE_NEWS    READ_NEWS
```

## Rotas HTTP

### Auth
| Método | Path | Use Case | Autenticação |
|--------|------|----------|--------------|
| `POST` | `/auth/login` | `LoginUserAdminUseCase` | Pública |

### Usuários (UserData)
| Método | Path | Use Case | Autenticação |
|--------|------|----------|--------------|
| `POST` | `/users` | `CreateUserUseCase` | Pública |
| `GET` | `/admin/users` | `ListUsersUseCase` | `READ_USER` |
| `PATCH` | `/users/:id` | `UpdateUserDataUseCase` | `UPDATE_USER` |
| `DELETE` | `/users/:id` | `DeleteUserDataUseCase` | `DELETE_USER` |

### Administradores (UserAdmin)
| Método | Path | Use Case | Autenticação |
|--------|------|----------|--------------|
| `GET` | `/admin/me` | `GetCurrentAdminUseCase` | JWT (qualquer admin) |
| `GET` | `/admin/users/admins` | `ListUserAdminsUseCase` | `READ_USER_ADMIN` |
| `POST` | `/admin/users` | `CreateUserAdminUseCase` | `CREATE_USER_ADMIN` |
| `PATCH` | `/admin/users/:id` | `UpdateUserAdminUseCase` | `UPDATE_USER_ADMIN` |
| `DELETE` | `/admin/users/:id` | `DeleteUserAdminUseCase` | `DELETE_USER_ADMIN` |

### Cursos
| Método | Path | Use Case | Autenticação |
|--------|------|----------|--------------|
| `GET` | `/courses` | `ListCoursesUseCase` | Pública |
| `GET` | `/courses/:courseId` | `GetCourseDetailUseCase` | Pública |
| `POST` | `/courses` | `CreateCourseUseCase` | `CREATE_COURSE` |
| `PATCH` | `/courses/:courseId` | `UpdateCourseUseCase` | `UPDATE_COURSE` |
| `DELETE` | `/courses/:courseId` | `DeleteCourseUseCase` | `DELETE_COURSE` |
| `POST` | `/courses/:courseId/banner` | `UploadCourseBannerUseCase` | `UPDATE_COURSE` |
| `POST` | `/courses/:courseId/gallery` | `AddCoursePhotoUseCase` | `UPDATE_COURSE` |
| `DELETE` | `/courses/:courseId/gallery/:photoId` | `DeleteCoursePhotoUseCase` | `UPDATE_COURSE` |
| `GET` | `/admin/courses` | `ListAllCoursesUseCase` | `READ_COURSE` |
| `GET` | `/admin/courses/:courseId` | `GetAdminCourseDetailUseCase` | `READ_COURSE` |

### Salas
| Método | Path | Use Case | Autenticação |
|--------|------|----------|--------------|
| `GET` | `/rooms` | `ListRoomsUseCase` | Pública |
| `POST` | `/rooms` | `CreateRoomUseCase` | `CREATE_COURSE` |

### Inscrições
| Método | Path | Use Case | Autenticação |
|--------|------|----------|--------------|
| `POST` | `/courses/:courseId/register` | `RegisterForCourseUseCase` | Pública |
| `GET` | `/admin/courses/:courseId/registrations` | `ListCourseRegistrationsUseCase` | `READ_COURSE` |
| `DELETE` | `/admin/registrations/:registrationId` | `CancelRegistrationUseCase` | `UPDATE_COURSE` |

### Notícias
| Método | Path | Use Case | Autenticação |
|--------|------|----------|--------------|
| `GET` | `/news` | `ListNewsUseCase` | Pública |
| `GET` | `/news/:newsId` | `GetNewsDetailUseCase` | Pública |
| `POST` | `/news` | `CreateNewsUseCase` | `CREATE_NEWS` |
| `PATCH` | `/news/:newsId` | `UpdateNewsUseCase` | `UPDATE_NEWS` |
| `DELETE` | `/news/:newsId` | `DeleteNewsUseCase` | `DELETE_NEWS` |
| `POST` | `/news/:newsId/banner` | `UploadNewsBannerUseCase` | `UPDATE_NEWS` |
| `POST` | `/news/:newsId/image` | `UploadNewsBlockImageUseCase` | `UPDATE_NEWS` |
| `GET` | `/admin/news` | `ListNewsUseCase` | `READ_NEWS` |

### Regras
| Método | Path | Use Case | Autenticação |
|--------|------|----------|--------------|
| `GET` | `/admin/rules` | `ListRulesUseCase` | `READ_RULE` |
| `POST` | `/rules` | `CreateRuleUseCase` | `CREATE_RULE` |
| `PATCH` | `/rules/:ruleId` | `UpdateRuleUseCase` | `UPDATE_RULE` |

### Dashboard
| Método | Path | Use Case | Autenticação |
|--------|------|----------|--------------|
| `GET` | `/admin/dashboard/stats` | `DashboardStatsUseCase` | `READ_COURSE` |

## Paginação

Rotas de listagem aceitam `?page=1&limit=20`. Resposta padrão:

```json
{ "data": [...], "total": 100, "page": 1, "limit": 20, "totalPages": 5 }
```

Rotas sem paginação: `GET /rooms`, `GET /admin/courses/:courseId/registrations`.

## Adaptadores de banco disponíveis

| Adapter | Arquivo | Port implementado |
|---------|---------|-------------------|
| `createUserDataAdapter` | `adapter/database/user-data.ts` | `UserDataRepository` |
| `createUserAdminAdapter` | `adapter/database/user-admin-adapter.ts` | `UserAdminRepository` |
| `createCourseAdapter` | `adapter/database/course-adapter.ts` | `CourseRepository` |
| `createRuleAdapter` | `adapter/database/rule-adapter.ts` | `RuleRepository` |
| `createNewsAdapter` | `adapter/database/news-adapter.ts` | `NewsRepository` |
| `createRoomAdapter` | `adapter/database/room-adapter.ts` | `RoomRepository` |
| `createRegistrationAdapter` | `adapter/database/registration-adapter.ts` | `RegistrationRepository` |
| `createStorageAdapter` | `adapter/storage/factory.ts` | `StorageRepository` |

## Padrão de implementação

### 1. Port (interface)
```ts
// src/ports/external/foo-repository.ts
export interface FooRepository {
  create(data: ...): Promise<FooModel | null>;
  findById(id: string): Promise<FooModel | null>;
}
```

### 2. Adapter (Prisma)
```ts
// src/adapter/database/foo.ts
export function createFooAdapter(prisma: PrismaClient): FooRepository {
    return new FooAdapter(prisma);
}
export class FooAdapter implements FooRepository {
  constructor(private prisma: PrismaClient) {}
  create(data) { return this.prisma.foo.create({ data }); }
}
```

### 3. Use Case
```ts
// src/usecase/create-foo.ts
export class CreateFooUseCase {
  constructor(private repo: FooRepository) {}
  async execute(request): Promise<{ success: boolean; error?: Error; fooId?: string }> { ... }
}
```

### 4. Controller
```ts
// src/http/controllers/create-foo.ts
export class CreateFooController {
  constructor(private useCase: CreateFooUseCase) {}
  async handle(req: FastifyRequest, reply: FastifyReply) {
    const body = req.body as CreateFooRequest;
    const response = await this.useCase.execute(body);
    // SEMPRE verificar erro antes de enviar resposta
    if (!response.success) {
      return reply.status(400).send({ error: response.error?.message });
    }
    return reply.status(201).send({ id: response.fooId });
  }
}
```

### 5. Router (plugin Fastify)
```ts
// src/http/router/foo-router.ts
export async function fooRouter(fastify: FastifyInstance, prisma: PrismaClient) {
  const repo = createFooAdapter(prisma);
  const controller = new CreateFooController(new CreateFooUseCase(repo));
  fastify.post('/foo', (req, res) => controller.handle(req, res));
}
```

### 6. Registrar em index.ts
```ts
server.register(fooRouter, prisma);
```

## Sistema de erros tipados

Os erros de domínio vivem em `src/errors/` divididos por categoria:

| Arquivo | Classe base | Subclasses específicas |
|---------|-------------|------------------------|
| `auth.ts` | `AuthError` | `InvalidCredentialsError` |
| `business-rule.ts` | `BusinessRuleError` | `RoomAlreadyBookedError`, `RegistrationsUnavailableError` |
| `conflict.ts` | `ConflictError` | `UserAlreadyExistsError`, `UsernameAlreadyExistsError`, `UsernameAlreadyInUseError`, `AdminAccountAlreadyExistsError`, `EmailOrCpfAlreadyInUseError`, `CourseRegistrationAlreadyExistsError` |
| `not-found.ts` | `NotFoundError` | `CourseNotFoundError`, `UserNotFoundError`, `UserDataNotFoundError`, `AdminNotFoundError`, `NewsNotFoundError`, `RoomNotFoundError`, `RuleNotFoundError`, `RoleNotFoundError`, `PermissionRuleNotFoundError`, `RegistrationNotFoundError`, `PhotoNotFoundError` |
| `validation.ts` | `ValidationError` | — (único com parâmetro de mensagem, para erros dinâmicos do Zod) |

Use cases lançam a subclasse específica. Controllers usam `errorToStatus(response.error)` de `http/lib/require-permission.ts` para mapear para HTTP status:

```ts
// errorToStatus mapping
NotFoundError  → 404
ConflictError  → 409
AuthError      → 401
default        → 400
```

### Padrão de error handling nos use cases

```ts
// Padrão padrão — success flag
type Response = { success: boolean; error?: Error; result?: ... }

// No controller — verificar erro ANTES de send()
if (!response.success) {
    return reply.status(errorToStatus(response.error)).send({ error: response.error?.message });
}
```

Nunca chamar `reply.send()` duas vezes — causa erro de dupla resposta no Fastify.

## Upload de arquivos (multipart)

O plugin `@fastify/multipart` está registrado em `index.ts`. Para receber arquivos no controller:

```ts
async handle(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const data = await request.file();
    if (!data) return reply.status(400).send({ error: 'Nenhum arquivo enviado' });
    const chunks: Buffer[] = [];
    for await (const chunk of data.file) chunks.push(chunk);
    const fileBuffer = Buffer.concat(chunks);
    // usar fileBuffer no use case
}
```

O `StorageRepository` é instanciado via `createStorageAdapter()` (sem parâmetros — lê `STORAGE_TYPE` do env).

## Autenticação

O JWT é gerado no `LoginUserAdminUseCase` com payload `{ userId, username, role }` e expiração de 1h.

Para rotas protegidas, verificar o token e checar a permissão na `Rule` do admin:
```ts
const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
const admin = await userAdminRepository.findById(decoded.userId);
const rule = await ruleRepository.findById(admin.rulesId);
const canDo = rule.permitions.includes('CREATE_COURSE');
```

No `CreateUserAdminUseCase`, o token é passado como `creatorToken` no request — o próprio use case faz a verificação de permissão.

Para extrair o token do header no controller:
```ts
const token = request.headers['authorization']?.replace('Bearer ', '') ?? '';
```

## Inicialização automática

Na primeira execução (`firstInitialize` em `index.ts`), o servidor cria:
1. Rule `SUPER_RULE` com todas as permissões
2. `UserData` do Eduardo (email: `eduardofrnkdev@gmail.com`)
3. `UserAdmin` com username `admin` e senha `admin` (apenas desenvolvimento)

## Swagger / Documentação interativa

O Swagger UI está disponível em `http://localhost:3000/docs` após iniciar o servidor.

- Especificação OpenAPI 3.0 gerada automaticamente pelo `@fastify/swagger`
- Interface visual servida pelo `@fastify/swagger-ui`
- Para rotas protegidas: clicar em **Authorize** no topo do Swagger UI e inserir o Bearer token obtido em `POST /auth/login`

### Schemas de rota

Cada router define um objeto `schema` na chamada `fastify.post(path, { schema }, handler)` com:
- `tags` — agrupa rotas por domínio na UI
- `summary` / `description` — documentação legível
- `body` — JSON Schema do corpo da requisição
- `params` — JSON Schema dos parâmetros de URL
- `response` — JSON Schema das respostas por status code
- `security: [{ bearerAuth: [] }]` — marca a rota como protegida na UI

### Exemplo de schema em router
```ts
fastify.post('/foo', {
    schema: {
        tags: ['Foo'],
        summary: 'Criar foo',
        security: [{ bearerAuth: [] }],
        body: {
            type: 'object',
            required: ['name'],
            properties: {
                name: { type: 'string', example: 'meu foo' },
            },
        },
        response: {
            201: {
                type: 'object',
                properties: { id: { type: 'string' } },
            },
        },
    },
}, handler);
```

## Comandos

```bash
npm run dev          # desenvolvimento com hot reload
npm run build        # compilar TypeScript
npm run start        # iniciar build compilado
npm run prisma:migrate   # criar/aplicar migrations
npm run prisma:generate  # regenerar tipos do Prisma
npm run prisma:studio    # interface visual do banco
```

## Observações importantes

- Importações internas devem usar extensão `.js` nos paths (requisito ESM)
- Os tipos do Prisma são importados de `src/generated/prisma/` — nunca editar esses arquivos
- O `PrismaClient` é importado de `../generated/prisma/client.js` (não do pacote padrão)
- O `StorageAdapter` é instanciado via factory `createStorageAdapter()` que lê `STORAGE_TYPE` do env
