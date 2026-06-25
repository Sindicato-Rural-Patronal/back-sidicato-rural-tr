# back-sindicato-rural-tr

Backend REST para o sistema de gestão do Sindicato Rural. Gerencia trabalhadores rurais (ficha de associado completa), administradores, cursos, inscrições, notícias e permissões.

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
  - [Endereços](#endereços)
  - [Relações entre Cadastros](#relações-entre-cadastros)
  - [Propriedades Rurais](#propriedades-rurais)
  - [Administradores](#administradores)
  - [Regras de Permissão](#regras-de-permissão)
  - [Salas](#salas)
  - [Cursos](#cursos)
  - [Inscrições em Cursos](#inscrições-em-cursos)
  - [Notícias](#notícias)
  - [Dashboard](#dashboard)
  - [Instrutores](#instrutores)
  - [Parceiros](#parceiros)
  - [Banners](#banners)
  - [Mensagens de Contato](#mensagens-de-contato)
- [Regras de Negócio](#regras-de-negócio)
- [Fluxos de Trabalho](#fluxos-de-trabalho)
- [Sistema de Erros](#sistema-de-erros)
- [Rotas](#rotas)
- [Filtros de Listagem](#filtros-de-listagem)
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
CORS_ORIGIN=*

# Supabase Storage (Project Settings → API Keys: URL + secret key)
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...

# Buckets (criar no Supabase e marcar como PUBLIC)
STORAGE_BUCKET=avatars
BANNER_BUCKET=course-banners
NEWS_BANNER_BUCKET=news-banners
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

1. Regra `SUPER_RULE` com todas as 26 permissões do sistema
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

Ficha de associado completa do trabalhador rural.

**Campos obrigatórios:** `name`, `email`, `phone`

**Campos opcionais — Identificação:** `nickname`, `cpf`, `cnpj`, `rg`, `rgIssuer`, `rgIssuedAt`, `birthDate`, `driverLicense`, `driverLicenseCategory`, `birthPlace`, `nationality`

**Campos opcionais — Perfil:** `maritalStatus`, `gender`, `ethnicity`, `educationLevel`, `functionalCategory`, `specialNeeds`, `phone2`, `phone3`

**Campos opcionais — Associação:** `memberClassification`, `cadPro`, `familyIncome`, `memberType`, `boardPosition`, `boardMember`, `memberStatus`, `memberSince`, `memberNotes`, `memberNotesNumber`

**Enums:**

| Campo | Valores |
|-------|---------|
| `maritalStatus` | `SINGLE`, `MARRIED`, `DIVORCED`, `WIDOWED`, `DOMESTIC_PARTNERSHIP` |
| `gender` | `MALE`, `FEMALE`, `OTHER` |
| `ethnicity` | `WHITE`, `BLACK`, `MIXED`, `ASIAN`, `INDIGENOUS` |
| `educationLevel` | `NO_FORMAL_EDUCATION`, `INCOMPLETE_PRIMARY`, `COMPLETE_PRIMARY`, `INCOMPLETE_SECONDARY`, `COMPLETE_SECONDARY`, `INCOMPLETE_HIGHER`, `COMPLETE_HIGHER`, `POSTGRADUATE` |
| `memberStatus` | `ACTIVE`, `INACTIVE` |

| Operação | Descrição |
|----------|-----------|
| Cadastrar | Cria novo usuário (campos obrigatórios + quaisquer opcionais) |
| Detalhe | Retorna ficha completa com endereço, relações e propriedades |
| Listar | Lista paginada de todos os usuários (admin) com filtros |
| Atualizar | Atualiza qualquer campo do perfil |
| Excluir | Remove usuário do sistema |
| Avatar | Upload de foto de perfil |
| Instrutor | Promover a instrutor (adiciona bio) ou rebaixar |

---

### Endereços

Modelo centralizado para endereços de usuários, propriedades e salas. Suporta endereço urbano e rural no mesmo registro.

**Campos compartilhados:** `city`, `state`, `zipCode`, `complement`, `notes`

**Campos urbanos:** `street`, `number`, `neighborhood`

**Campos rurais:** `localityName`, `road`, `km`, `lot`, `section`

| `type` | Uso |
|--------|-----|
| `URBAN` | Endereço de cidade/município |
| `RURAL` | Localidade rural (fazenda, sítio, comunidade) |

| Operação | Descrição |
|----------|-----------|
| Criar/Atualizar endereço do usuário | `PUT /admin/users/:id/address` — cria se não existir, atualiza se já houver |

---

### Relações entre Cadastros

Vincula dois cadastros de `UserData` com um rótulo livre (sem enum fixo). Permite modelar qualquer tipo de relação: cônjuge, filho, sócio, etc.

**Campos:** `sourceId`, `targetId`, `label` (texto livre)

A relação é direcional — se A aponta para B, B não aponta automaticamente para A.

| Operação | Descrição |
|----------|-----------|
| Adicionar relação | Vincula dois cadastros com rótulo opcional |
| Remover relação | Remove o vínculo |

---

### Propriedades Rurais

Imóveis rurais vinculados a um associado. Cada propriedade pode ter seu próprio endereço.

**Campos:** `name`, `registration` (matrícula, opcional), `addressId` (opcional)

| Operação | Descrição |
|----------|-----------|
| Adicionar | Cria propriedade vinculada ao usuário, com endereço opcional |
| Remover | Remove a propriedade |

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

**Permissões disponíveis (26 no total):**

| Domínio | Permissões |
|---------|-----------|
| Usuários | `CREATE_USER`, `UPDATE_USER`, `DELETE_USER`, `READ_USER` |
| Cursos | `CREATE_COURSE`, `UPDATE_COURSE`, `DELETE_COURSE`, `READ_COURSE` |
| Regras | `CREATE_RULE`, `UPDATE_RULE`, `DELETE_RULE`, `READ_RULE` |
| Admins | `CREATE_USER_ADMIN`, `UPDATE_USER_ADMIN`, `DELETE_USER_ADMIN`, `READ_USER_ADMIN` |
| Notícias | `CREATE_NEWS`, `UPDATE_NEWS`, `DELETE_NEWS`, `READ_NEWS` |
| Contatos | `READ_CONTACT`, `UPDATE_CONTACT` |
| Banners | `CREATE_BANNER`, `UPDATE_BANNER`, `DELETE_BANNER`, `READ_BANNER` |

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
| `PUBLIC` | Visível na listagem pública |
| `PRIVATE` | Oculto na listagem pública, mas aceita inscrições via link direto |
| `UNPUBLISHED` | Oculto e sem inscrições |

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

**Status possíveis:** `PUBLISHED`, `UNPUBLISHED`

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
- Cursos por status (`PUBLIC`, `PRIVATE`, `UNPUBLISHED`) e total
- Total de inscrições em cursos

---

### Instrutores

`UserData` pode ser promovido a instrutor para ministrar cursos. A promoção cria um registro `UserInstructor` vinculado.

**Campo extra:** `bio` (descrição/biografia do instrutor)

Instrutores são atribuídos a cursos com um `title` e uma `category` por atribuição.

| Operação | Descrição |
|----------|-----------|
| Promover | Cria registro de instrutor vinculado ao UserData |
| Rebaixar | Remove o registro de instrutor |
| Listar | Retorna todos os instrutores com dados do usuário |
| Adicionar ao curso | Vincula instrutor a um curso com título e categoria |
| Remover do curso | Remove a atribuição do instrutor ao curso |

---

### Parceiros

`UserData` marcados como parceiro (`isPartner: true`) aparecem na página pública de parceiros do sindicato.

**Campos:** `isPartner`, `partnerLogo` (URL), `partnerUrl`, `partnerOrder` (ordenação)

| Operação | Descrição |
|----------|-----------|
| Listar (público) | Retorna todos os parceiros ativos ordenados por `partnerOrder` |
| Reordenar | Atualiza a ordem dos parceiros em lote |
| Upload logo | Faz upload da logo do parceiro |

---

### Banners

Banners rotativos exibidos na página inicial. Suportam botões de ação e agendamento por data.

**Campos:** `title`, `subtitle`, `imageUrl`, `active`, `order`, `buttons` (JSON — lista de `{ label, url }`), `startDate`, `endDate`

| Operação | Descrição |
|----------|-----------|
| Listar (público) | Retorna banners ativos dentro do período `startDate–endDate` |
| Listar (admin) | Retorna todos os banners independente de status ou data |
| Criar | Cria novo banner com título, subtítulo, status e botões |
| Atualizar | Atualiza qualquer campo do banner |
| Excluir | Remove o banner |
| Upload imagem | Faz upload da imagem do banner |
| Reordenar | Atualiza a ordem dos banners em lote |

---

### Mensagens de Contato

Formulário público de contato cujas mensagens ficam armazenadas para triagem interna.

**Campos:** `name`, `email`, `phone`, `subject`, `message`, `read`, `createdAt`

| Operação | Descrição |
|----------|-----------|
| Enviar (público) | Registra nova mensagem de contato |
| Listar (admin) | Lista todas as mensagens com filtro de lidas/não lidas |
| Marcar como lido | Marca uma mensagem como lida |
| Excluir | Remove a mensagem |

---

## Regras de Negócio

### Usuários
- Email e telefone devem ser únicos no sistema
- Email e CPF devem ser únicos ao atualizar (não pode colidir com outro usuário)

### Endereços / Propriedades / Relações
- Endereço é centralizado: um único modelo `Address` serve usuários, propriedades e salas
- `PUT /admin/users/:id/address` é um upsert — cria endereço se não existir, atualiza se já houver
- Relações são direcionais e com rótulo livre — não há enum de tipo de parentesco
- Excluir um `UserData` cascata em suas relações e propriedades

### Administradores
- Username deve ser único entre todos os admins
- Cada `UserData` só pode ter **uma** conta admin vinculada
- Senha armazenada como hash bcrypt
- Admin deve ter uma regra de permissão válida

### Cursos
- A sala selecionada deve existir
- **Verificação de conflito de sala:** ao criar ou atualizar, o sistema verifica se a sala já está ocupada no intervalo `startTime–endTime` por outro curso — retorna erro `RoomAlreadyBookedError` se houver sobreposição
- Cursos `PRIVATE` ficam ocultos na listagem pública mas **aceitam inscrições** via link direto
- Cursos `UNPUBLISHED` **não aceitam inscrições**

### Inscrições
- O curso deve existir
- Cursos `UNPUBLISHED` retornam `RegistrationsUnavailableError`
- Se já existir um `UserData` com o mesmo email **ou** CPF informado, a inscrição é vinculada ao usuário existente (não cria duplicata)
- Um usuário não pode se inscrever no mesmo curso duas vezes — retorna `CourseRegistrationAlreadyExistsError`

### Notícias
- Ao publicar (`status: PUBLISHED`) sem informar `publishedAt`, o campo é preenchido automaticamente com a data/hora atual
- Ao republicar (estava `UNPUBLISHED`, muda para `PUBLISHED`), `publishedAt` também é definido automaticamente se não informado

### Regras de Permissão
- Uma regra deve ter ao menos **uma** permissão

### Upload de Imagens
- Banners de curso são redimensionados para **1920×1080** (cover/center), convertidos para JPEG com qualidade 85%
- URL retornada inclui parâmetro `?t=timestamp` para invalidar cache

---

## Fluxos de Trabalho

### Fluxo: Cadastrar associado completo

```
1. POST /users                             — criar UserData com campos básicos
2. PUT  /admin/users/:id/address           — registrar endereço (urbano ou rural)
3. POST /admin/users/:id/properties        — adicionar propriedade rural (opcional, repetir)
4. POST /admin/users/:id/relations         — vincular cadastro relacionado, ex: { targetId, label: "conjugue" }
5. PATCH /users/:id                        — atualizar dados de associação (memberStatus, memberSince, etc.)
6. GET   /admin/users/:id                  — verificar ficha completa
```

### Fluxo: Criar e publicar um curso

```
1. POST /rooms               — criar sala (se necessário)
2. POST /courses             — criar curso com status UNPUBLISHED
3. POST /courses/:id/banner  — upload da imagem de capa
4. POST /courses/:id/gallery — adicionar fotos à galeria (opcional)
5. PATCH /courses/:id        — atualizar status para PUBLIC
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
1. POST /news                — criar notícia com status UNPUBLISHED
2. POST /news/:id/banner     — upload do banner
3. POST /news/:id/image      — upload de imagens de bloco (opcional, repetir)
4. PATCH /news/:id           — atualizar status para PUBLISHED
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
| `UserRelationNotFoundError` | Relação entre cadastros não encontrada |
| `PropertyNotFoundError` | Propriedade rural não encontrada |
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
| `GET` | `/admin/users/:id` | `READ_USER` |
| `PATCH` | `/users/:id` | `UPDATE_USER` |
| `DELETE` | `/users/:id` | `DELETE_USER` |
| `PUT` | `/admin/users/:id/address` | `UPDATE_USER` |
| `POST` | `/admin/users/:id/relations` | `UPDATE_USER` |
| `DELETE` | `/admin/users/:id/relations/:relationId` | `UPDATE_USER` |
| `POST` | `/admin/users/:id/properties` | `UPDATE_USER` |
| `DELETE` | `/admin/users/:id/properties/:propertyId` | `UPDATE_USER` |
| `POST` | `/admin/users/:id/avatar` | `UPDATE_USER` |

### Parceiros

| Método | Rota | Permissão |
|--------|------|-----------|
| `GET` | `/partners` | Pública |
| `PATCH` | `/admin/partners/reorder` | `UPDATE_USER` |
| `POST` | `/admin/users/:id/partner-logo` | `UPDATE_USER` |

### Administradores

| Método | Rota | Permissão |
|--------|------|-----------|
| `GET` | `/contacts` | Pública (lista admins públicos) |
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

### Instrutores

| Método | Rota | Permissão |
|--------|------|-----------|
| `POST` | `/admin/users/:id/instructor` | `UPDATE_USER` |
| `DELETE` | `/admin/users/:id/instructor` | `UPDATE_USER` |
| `GET` | `/admin/instructors` | `READ_USER` |
| `POST` | `/admin/courses/:courseId/instructors` | `UPDATE_COURSE` |
| `DELETE` | `/admin/courses/:courseId/instructors/:assignmentId` | `UPDATE_COURSE` |

### Banners

| Método | Rota | Permissão |
|--------|------|-----------|
| `GET` | `/banners` | Pública |
| `GET` | `/admin/banners` | `READ_BANNER` |
| `POST` | `/admin/banners` | `CREATE_BANNER` |
| `PATCH` | `/admin/banners/:id` | `UPDATE_BANNER` |
| `DELETE` | `/admin/banners/:id` | `DELETE_BANNER` |
| `POST` | `/admin/banners/:id/image` | `UPDATE_BANNER` |
| `PATCH` | `/admin/banners/reorder` | `UPDATE_BANNER` |

### Mensagens de Contato

| Método | Rota | Permissão |
|--------|------|-----------|
| `POST` | `/contacts/message` | Pública |
| `GET` | `/admin/contacts/messages` | `READ_CONTACT` |
| `PATCH` | `/admin/contacts/messages/:messageId` | `UPDATE_CONTACT` |
| `DELETE` | `/admin/contacts/messages/:messageId` | `UPDATE_CONTACT` |

### Regras

| Método | Rota | Permissão |
|--------|------|-----------|
| `GET` | `/admin/rules` | `READ_RULE` |
| `POST` | `/rules` | `CREATE_RULE` |
| `PATCH` | `/rules/:ruleId` | `UPDATE_RULE` |

### Endereço

| Método | Rota | Permissão |
|--------|------|-----------|
| `GET` | `/address/cep/:cep` | Pública |

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

Rotas sem paginação: `GET /rooms`, `GET /admin/courses/:courseId/registrations`, `GET /banners`, `GET /admin/banners`, `GET /admin/instructors`.

---

## Filtros de Listagem

Além de `page` e `limit`, as seguintes rotas aceitam filtros adicionais:

| Rota | Query params |
|------|-------------|
| `GET /admin/users` | `search` (nome/email/CPF), `memberType`, `memberClassification`, `gender`, `ethnicity`, `educationLevel` |
| `GET /admin/users/admins` | `search` (username) |
| `GET /admin/courses` | `status` (PUBLIC/PRIVATE/UNPUBLISHED), `search` (nome) |
| `GET /admin/news` | `status` (PUBLISHED/UNPUBLISHED) |

Todos os filtros são opcionais e combinativos. Exemplo: `GET /admin/users?search=joão&gender=MALE&memberType=WORKER`.

---

## Testes

```bash
npm run test:run
```

Testes unitários cobrindo os use cases principais. Os testes usam repositórios em memória — sem banco real, sem storage.

> Use cases sem cobertura de testes: `get-user-detail`, `upsert-user-address`, `add-user-relation`, `delete-user-relation`, `add-property`, `delete-property`, e todos os use cases de instrutores, parceiros, banners e contatos.
