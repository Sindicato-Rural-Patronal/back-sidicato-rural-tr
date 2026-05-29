# CLAUDE.md — back-sindicato-rural-tr

Backend de um **Sindicato Rural** para gerenciar usuários trabalhadores, administradores, regras de permissão e cursos.

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
  lib/prisma.ts               — factory do PrismaClient com adapter PrismaPg
  http/
    controllers/              — recebem FastifyRequest/Reply, delegam ao use case
    router/                   — registram rotas como plugins Fastify
  usecase/                    — lógica de negócio pura (sem Fastify, sem Prisma direto)
  ports/external/             — interfaces TypeScript dos repositórios
  adapter/
    database/                 — implementações Prisma das interfaces de repositório
    storage/                  — S3 e MinIO, selecionados via factory
  generated/prisma/           — tipos gerados pelo Prisma (não editar)
```

## Modelos de dados

| Modelo                   | Campos principais                                              |
|--------------------------|----------------------------------------------------------------|
| `UserData`               | id, name, email, phone, cpf, cnpj, avatar                     |
| `UserAdmin`              | id, username, passwordHash, userDataId (FK), rulesId (FK)     |
| `Rule`                   | id, name, description, permitions (String[])                  |
| `course`                 | id, name, description, maxRegistrations                       |
| `courseUserRegistration` | id, courseId (FK), userDataId (FK)                            |

## Permissões disponíveis (em `Rule.permitions`)

`CREATE_USER`, `UPDATE_USER`, `DELETE_USER`, `READ_USER`
`CREATE_COURSE`, `UPDATE_COURSE`, `DELETE_COURSE`, `READ_COURSE`
`CREATE_RULE`, `UPDATE_RULE`, `DELETE_RULE`, `READ_RULE`
`CREATE_USER_ADMIN`, `UPDATE_USER_ADMIN`, `DELETE_USER_ADMIN`, `READ_USER_ADMIN`

## Rotas HTTP

| Método | Path | Use Case | Autenticação |
|--------|------|----------|--------------|
| `POST` | `/users` | `CreateUserUseCase` | Pública |
| `POST` | `/auth/login` | `LoginUserAdminUseCase` | Pública |
| `POST` | `/admin/users` | `CreateUserAdminUseCase` | Bearer token + permissão `CREATE_USER_ADMIN` |
| `POST` | `/courses` | `CreateCourseUseCase` | Bearer token + permissão `CREATE_COURSE` |
| `POST` | `/courses/:courseId/banner` | `UploadCourseBannerUseCase` | Bearer token + permissão `UPDATE_COURSE` |
| `POST` | `/rules` | `CreateRuleUseCase` | Bearer token + permissão `CREATE_RULE` |

## Adaptadores de banco disponíveis

| Adapter | Arquivo | Port implementado |
|---------|---------|-------------------|
| `createUserDataAdapter` | `adapter/database/user-data.ts` | `UserDataRepository` |
| `createUserAdminAdapter` | `adapter/database/user-admin-adapter.ts` | `UserAdminRepository` |
| `createCourseAdapter` | `adapter/database/course-adapter.ts` | `CourseRepository` |
| `createRuleAdapter` | `adapter/database/rule-adapter.ts` | `RuleRepository` |

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

## Padrão de error handling

Use cases usam dois estilos — prefira o padrão com `success` flag:

```ts
// Preferido (padrão B — create-rule, create-course)
type Response = { success: boolean; error?: Error; result?: ... }

// Legado (padrão A — create-user-data)
type Response = { id: string; ...; Error?: Error }
```

No controller, **sempre verificar o erro ANTES de chamar `reply.send()`** — chamar `send()` e depois tentar outro `send()` causa erro de dupla resposta.

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
