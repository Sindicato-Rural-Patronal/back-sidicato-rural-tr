# back-sindicato-rural-tr

Backend REST para o sistema de gestão do Sindicato Rural. Gerencia trabalhadores, administradores, cursos, inscrições, notícias e permissões.

---

## Sumário

- [Stack](#stack)
- [Configuração](#configuração)
- [Comandos](#comandos)
- [Inicialização automática](#inicialização-automática)
- [Documentação interativa (Swagger)](#documentação-interativa-swagger)
- [Arquitetura](#arquitetura)
- [Funcionalidades](#funcionalidades)
  - [Autenticação](#autenticação)
  - [Usuários (UserData)](#usuários-userdata)
  - [Administradores](#administradores)
  - [Regras de Permissão](#regras-de-permissão)
  - [Salas](#salas)
  - [Cursos](#cursos)
  - [Inscrições em Cursos](#inscrições-em-cursos)
  - [Notícias](#notícias)
  - [Dashboard](#dashboard)
- [Regras de Negócio](#regras-de-negócio)
- [Fluxos de Trabalho](#fluxos-de-trabalho)
- [Sistema de Erros](#sistema-de-erros)
- [Rotas](#rotas)
- [Testes](#testes)

---

## Stack

- **Node.js + TypeScript** (ESM, `"type": "module"`)
- **Fastify v5** — framework HTTP
- **Prisma 7 + PostgreSQL** — banco de dados com driver nativo `@prisma/adapter-pg`
- **JWT + bcrypt** — autenticação e hash de senha
- **AWS S3 / MinIO** — storage de arquivos (imagens, banners, fotos)
- **Zod** — validação de schemas e variáveis de ambiente
- **Sharp** — processamento de imagens (resize, compressão)
- **Vitest** — testes unitários

---

## Configuração

Copie `.env.example` para `.env` e preencha:

```env
DATABASE_URL=postgresql://user:pass@localhost:5432/sindicato
JWT_SECRET=sua-chave-secreta-com-minimo-32-caracteres
PORT=3000
NODE_ENV=development
STORAGE_TYPE=minio           # minio | s3
MINIO_ENDPOINT=http://localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
STORAGE_BUCKET=avatars
BANNER_BUCKET=course-banners
```

---

## Comandos

```bash
npm run dev              # desenvolvimento com hot reload (tsx watch)
npm run build            # compilar TypeScript
npm run start            # iniciar build compilado
npm test                 # rodar testes em modo watch
npm run test:run         # rodar testes uma vez
npm run test:coverage    # cobertura de testes
npm run lint             # verificar ESLint
npm run lint:fix         # corrigir ESLint automaticamente
npm run format           # formatar com Prettier
npm run fix              # prettier + eslint --fix (ordem correta)
npm run prisma:migrate   # criar/aplicar migrations
npm run prisma:generate  # regenerar tipos do Prisma
npm run prisma:studio    # interface visual do banco
```

---

## Inicialização automática

Na primeira execução (`firstInitialize`), o servidor cria automaticamente:

1. Regra `SUPER_RULE` com todas as 20 permissões do sistema
2. `UserData` do administrador principal (`eduardofrnkdev@gmail.com`)
3. `UserAdmin` com `username: admin` / `password: admin`

> **Atenção:** alterar a senha padrão em produção.

---

## Documentação interativa (Swagger)

Disponível em `http://localhost:3000/docs` após iniciar o servidor.

Para testar rotas protegidas: faça login em `POST /auth/login`, copie o token retornado e clique em **Authorize** no topo do Swagger UI.

---

## Arquitetura

Segue o padrão Hexagonal (Ports & Adapters):

```
src/
  errors/           — classes de erro tipadas por categoria
  http/
    controllers/    — recebem request/reply, delegam ao use case
    router/         — registram rotas Fastify com schemas Swagger
    lib/            — requirePermission, requireAuth, errorToStatus
  usecase/          — lógica de negócio pura (sem Fastify, sem Prisma)
  ports/external/   — interfaces TypeScript dos repositórios
  adapter/
    database/       — implementações Prisma das interfaces
    storage/        — S3 e MinIO, selecionados via factory
  config/env.ts     — validação de variáveis de ambiente (Zod)
  lib/
    auth.ts         — decodeToken (jwt.verify wrapper)
    prisma.ts       — factory do PrismaClient
```

---

## Funcionalidades

### Autenticação

Login de administradores via username/password com retorno de JWT.

| Campo | Descrição |
|-------|-----------|
| `username` | Nome de usuário do admin |
| `password` | Senha do admin |

- Token JWT válido por **1 hora**
- Payload do token: `{ userId, username, role }`
- Rotas protegidas exigem header `Authorization: Bearer <token>`

---

### Usuários (UserData)

Gerenciamento de trabalhadores rurais cadastrados no sistema.

**Campos:** `id`, `name`, `email`, `phone`, `cpf`, `cnpj`, `avatar`

| Operação | Descrição |
|----------|-----------|
| Cadastrar | Cria novo usuário com nome, email, telefone e CPF |
| Listar | Lista paginada de todos os usuários (admin) |
| Atualizar | Atualiza dados do perfil (nome, email, telefone, CPF, CNPJ) |
| Excluir | Remove usuário do sistema |
| Avatar | Upload de foto de perfil |

---

### Administradores

Contas de acesso ao painel administrativo, vinculadas a um `UserData`.

**Campos:** `id`, `username`, `passwordHash`, `userDataId`, `rulesId`

| Operação | Descrição |
|----------|-----------|
| Criar | Cria conta admin vinculada a um UserData com uma regra de permissão |
| Listar | Lista paginada de todos os admins com detalhes |
| Atualizar | Atualiza username, senha e/ou regra de permissão |
| Excluir | Remove conta admin |
| Perfil próprio | Retorna dados e permissões do admin logado |

---

### Regras de Permissão

Sistema de controle de acesso baseado em roles. Cada admin possui uma regra com um conjunto de permissões.

**Permissões disponíveis (20 no total):**

| Domínio | Permissões |
|---------|-----------|
| Usuários | `CREATE_USER`, `UPDATE_USER`, `DELETE_USER`, `READ_USER` |
| Cursos | `CREATE_COURSE`, `UPDATE_COURSE`, `DELETE_COURSE`, `READ_COURSE` |
| Regras | `CREATE_RULE`, `UPDATE_RULE`, `DELETE_RULE`, `READ_RULE` |
| Admins | `CREATE_USER_ADMIN`, `UPDATE_USER_ADMIN`, `DELETE_USER_ADMIN`, `READ_USER_ADMIN` |
| Notícias | `CREATE_NEWS`, `UPDATE_NEWS`, `DELETE_NEWS`, `READ_NEWS` |

| Operação | Descrição |
|----------|-----------|
| Criar | Cria regra com nome, descrição e lista de permissões |
| Listar | Lista paginada de todas as regras |
| Atualizar | Atualiza nome, descrição e permissões da regra |

---

### Salas

Locais físicos onde os cursos são realizados.

**Campos:** `id`, `name`, `description`, `maxCapacity`

| Operação | Descrição |
|----------|-----------|
| Criar | Cria sala com nome, descrição e capacidade máxima |
| Listar | Retorna todas as salas (sem paginação) |

---

### Cursos

Cursos e eventos oferecidos pelo sindicato.

**Campos:** `id`, `name`, `description`, `roomId`, `startTime`, `endTime`, `status`, `price`, `workloadHours`, `coverImage`, `eventNumber`, `minStudents`, `preEnrolled`, `waitlist`, `registrationDeadline`, `observations`

**Status possíveis:**

| Status | Visibilidade |
|--------|-------------|
| `PUBLICO` | Visível na listagem pública |
| `PRIVADO` | Oculto na listagem pública, mas aceita inscrições via link direto |
| `NAO_PUBLICADO` | Oculto e sem inscrições |

| Operação | Descrição |
|----------|-----------|
| Criar | Cria curso com sala, datas, preço, carga horária e status |
| Listar (público) | Retorna apenas cursos `PUBLICO` com paginação |
| Detalhe (público) | Retorna detalhes completos de um curso |
| Listar (admin) | Retorna todos os cursos com status e contagem de inscritos |
| Detalhe (admin) | Retorna detalhes completos incluindo dados administrativos |
| Atualizar | Atualiza qualquer campo do curso |
| Excluir | Remove o curso |
| Banner | Upload de imagem de capa (redimensionada para 1920×1080, JPEG 85%) |
| Galeria | Adicionar/remover fotos da galeria do curso |

---

### Inscrições em Cursos

Registro de participação de usuários em cursos.

**Campos:** `id`, `courseId`, `userDataId`

| Operação | Descrição |
|----------|-----------|
| Inscrever | Registra usuário em um curso (cria UserData se não existir) |
| Listar | Lista todas as inscrições de um curso com dados do usuário |
| Cancelar | Remove uma inscrição |

---

### Notícias

Publicação de conteúdo editorial pelo sindicato.

**Campos:** `id`, `title`, `content`, `summary`, `bannerUrl`, `status`, `publishedAt`

**Status possíveis:** `PUBLICADO`, `NAO_PUBLICADO`

| Operação | Descrição |
|----------|-----------|
| Criar | Cria notícia com título, conteúdo, resumo e status |
| Listar (público) | Retorna apenas notícias `PUBLICADO` com paginação |
| Detalhe (público) | Retorna detalhes de uma notícia |
| Listar (admin) | Retorna todas as notícias independente de status |
| Atualizar | Atualiza título, conteúdo, resumo, status e data de publicação |
| Excluir | Remove a notícia |
| Banner | Upload de imagem de capa |
| Imagem de bloco | Upload de imagem para uso no corpo da notícia |

---

### Dashboard

Estatísticas agregadas do sistema para o painel administrativo.

Retorna:
- Total de usuários cadastrados
- Total de administradores
- Cursos por status (`PUBLICO`, `PRIVADO`, `NAO_PUBLICADO`) e total
- Total de inscrições em cursos

---

## Regras de Negócio

### Usuários
- Email e telefone devem ser únicos no sistema
- Email e CPF devem ser únicos ao atualizar (não pode colidir com outro usuário)

### Administradores
- Username deve ser único entre todos os admins
- Cada `UserData` só pode ter **uma** conta admin vinculada
- Senha armazenada como hash bcrypt
- Admin deve ter uma regra de permissão válida

### Cursos
- A sala selecionada deve existir
- **Verificação de conflito de sala:** ao criar ou atualizar, o sistema verifica se a sala já está ocupada no intervalo `startTime–endTime` por outro curso — retorna erro `RoomAlreadyBookedError` se houver sobreposição
- Cursos `PRIVADO` ficam ocultos na listagem pública mas **aceitam inscrições** via link direto
- Cursos `NAO_PUBLICADO` **não aceitam inscrições**

### Inscrições
- O curso deve existir
- Cursos `NAO_PUBLICADO` retornam `RegistrationsUnavailableError`
- Se já existir um `UserData` com o mesmo email **ou** CPF informado, a inscrição é vinculada ao usuário existente (não cria duplicata)
- Um usuário não pode se inscrever no mesmo curso duas vezes — retorna `CourseRegistrationAlreadyExistsError`

### Notícias
- Ao publicar (`status: PUBLICADO`) sem informar `publishedAt`, o campo é preenchido automaticamente com a data/hora atual
- Ao republicar (estava `NAO_PUBLICADO`, muda para `PUBLICADO`), `publishedAt` também é definido automaticamente se não informado

### Regras de Permissão
- Uma regra deve ter ao menos **uma** permissão

### Upload de Imagens
- Banners de curso são redimensionados para **1920×1080** (cover/center), convertidos para JPEG com qualidade 85%
- URL retornada inclui parâmetro `?t=timestamp` para invalidar cache

---

## Fluxos de Trabalho

### Fluxo: Criar e publicar um curso

```
1. POST /rooms               — criar sala (se necessário)
2. POST /courses             — criar curso com status NAO_PUBLICADO
3. POST /courses/:id/banner  — upload da imagem de capa
4. POST /courses/:id/gallery — adicionar fotos à galeria (opcional)
5. PATCH /courses/:id        — atualizar status para PUBLICO
```

### Fluxo: Inscrição de usuário em curso

```
1. GET  /courses             — usuário encontra o curso
2. GET  /courses/:id         — visualiza detalhes
3. POST /courses/:id/register — envia nome, email, CPF e telefone
   → sistema cria UserData se não existir
   → retorna registrationId e userDataId
```

### Fluxo: Gerenciar administradores

```
1. POST /users               — criar UserData do futuro admin
2. POST /rules               — criar regra com as permissões adequadas (se necessário)
3. POST /admin/users         — criar conta admin vinculando UserData + regra
4. POST /auth/login          — novo admin faz login e recebe token JWT
```

### Fluxo: Publicar notícia

```
1. POST /news                — criar notícia com status NAO_PUBLICADO
2. POST /news/:id/banner     — upload do banner
3. POST /news/:id/image      — upload de imagens de bloco (opcional, repetir)
4. PATCH /news/:id           — atualizar status para PUBLICADO
   → publishedAt é definido automaticamente
```

### Fluxo: Login e acesso autenticado

```
1. POST /auth/login          — recebe token JWT (válido 1h)
2. Incluir header em todas as chamadas protegidas:
   Authorization: Bearer <token>
3. GET /admin/me             — verificar permissões do admin logado
```

---

## Sistema de Erros

Erros de domínio são classes tipadas retornadas pelos use cases. Controllers mapeiam para status HTTP via `errorToStatus()`:

| Categoria | Classe base | Status HTTP |
|-----------|-------------|-------------|
| Não encontrado | `NotFoundError` | 404 |
| Conflito | `ConflictError` | 409 |
| Autenticação | `AuthError` | 401 |
| Regra de negócio / Validação | `BusinessRuleError`, `ValidationError` | 400 |

**Erros específicos:**

| Erro | Quando ocorre |
|------|---------------|
| `InvalidCredentialsError` | Username não existe ou senha incorreta |
| `UserAlreadyExistsError` | Email ou telefone já cadastrado |
| `EmailOrCpfAlreadyInUseError` | Email ou CPF já em uso por outro usuário |
| `UsernameAlreadyExistsError` | Username já existe ao criar admin |
| `UsernameAlreadyInUseError` | Username já em uso ao atualizar admin |
| `AdminAccountAlreadyExistsError` | UserData já possui conta admin |
| `CourseRegistrationAlreadyExistsError` | Usuário já inscrito no curso |
| `RoomAlreadyBookedError` | Sala ocupada no horário solicitado |
| `RegistrationsUnavailableError` | Curso não publicado não aceita inscrições |
| `CourseNotFoundError` | Curso não encontrado |
| `UserNotFoundError` / `UserDataNotFoundError` | Usuário não encontrado |
| `AdminNotFoundError` | Admin não encontrado |
| `NewsNotFoundError` | Notícia não encontrada |
| `RoomNotFoundError` | Sala não encontrada |
| `RuleNotFoundError` / `RoleNotFoundError` | Regra não encontrada |
| `RegistrationNotFoundError` | Inscrição não encontrada |
| `PhotoNotFoundError` | Foto não encontrada |
| `PermissionRuleNotFoundError` | Regra de permissão do admin não encontrada |
| `ValidationError` | Dados de entrada inválidos (mensagem do Zod) |

---

## Rotas

### Autenticação

| Método | Rota | Permissão |
|--------|------|-----------|
| `POST` | `/auth/login` | Pública |

### Usuários

| Método | Rota | Permissão |
|--------|------|-----------|
| `POST` | `/users` | Pública |
| `GET` | `/admin/users` | `READ_USER` |
| `PATCH` | `/users/:id` | `UPDATE_USER` |
| `DELETE` | `/users/:id` | `DELETE_USER` |

### Administradores

| Método | Rota | Permissão |
|--------|------|-----------|
| `GET` | `/admin/me` | JWT (qualquer admin) |
| `GET` | `/admin/users/admins` | `READ_USER_ADMIN` |
| `POST` | `/admin/users` | `CREATE_USER_ADMIN` |
| `PATCH` | `/admin/users/:id` | `UPDATE_USER_ADMIN` |
| `DELETE` | `/admin/users/:id` | `DELETE_USER_ADMIN` |

### Cursos

| Método | Rota | Permissão |
|--------|------|-----------|
| `GET` | `/courses` | Pública |
| `GET` | `/courses/:courseId` | Pública |
| `POST` | `/courses` | `CREATE_COURSE` |
| `PATCH` | `/courses/:courseId` | `UPDATE_COURSE` |
| `DELETE` | `/courses/:courseId` | `DELETE_COURSE` |
| `POST` | `/courses/:courseId/banner` | `UPDATE_COURSE` |
| `POST` | `/courses/:courseId/gallery` | `UPDATE_COURSE` |
| `DELETE` | `/courses/:courseId/gallery/:photoId` | `UPDATE_COURSE` |
| `GET` | `/admin/courses` | `READ_COURSE` |
| `GET` | `/admin/courses/:courseId` | `READ_COURSE` |

### Salas

| Método | Rota | Permissão |
|--------|------|-----------|
| `GET` | `/rooms` | Pública |
| `POST` | `/rooms` | `CREATE_COURSE` |

### Inscrições

| Método | Rota | Permissão |
|--------|------|-----------|
| `POST` | `/courses/:courseId/register` | Pública |
| `GET` | `/admin/courses/:courseId/registrations` | `READ_COURSE` |
| `DELETE` | `/admin/registrations/:registrationId` | `UPDATE_COURSE` |

### Notícias

| Método | Rota | Permissão |
|--------|------|-----------|
| `GET` | `/news` | Pública |
| `GET` | `/news/:newsId` | Pública |
| `POST` | `/news` | `CREATE_NEWS` |
| `PATCH` | `/news/:newsId` | `UPDATE_NEWS` |
| `DELETE` | `/news/:newsId` | `DELETE_NEWS` |
| `POST` | `/news/:newsId/banner` | `UPDATE_NEWS` |
| `POST` | `/news/:newsId/image` | `UPDATE_NEWS` |
| `GET` | `/admin/news` | `READ_NEWS` |

### Regras

| Método | Rota | Permissão |
|--------|------|-----------|
| `GET` | `/admin/rules` | `READ_RULE` |
| `POST` | `/rules` | `CREATE_RULE` |
| `PATCH` | `/rules/:ruleId` | `UPDATE_RULE` |

### Dashboard

| Método | Rota | Permissão |
|--------|------|-----------|
| `GET` | `/admin/dashboard/stats` | `READ_COURSE` |

### Paginação

Rotas de listagem aceitam query params `?page=1&limit=20`. Resposta padrão:

```json
{
  "data": [...],
  "total": 100,
  "page": 1,
  "limit": 20,
  "totalPages": 5
}
```

Rota sem paginação: `GET /rooms` e `GET /admin/courses/:courseId/registrations`.

---

## Testes

```bash
npm run test:run
```

101 testes unitários cobrindo todos os use cases. Os testes usam repositórios em memória — sem banco real, sem storage.
