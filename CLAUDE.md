# CLAUDE.md — back-sindicato-rural-tr

API do **Sindicato Rural de Terra Roxa**: cadastro de pessoas e empresas, administradores e regras de permissão, cursos e inscrições, salas e reservas, notícias, banners, galerias, cotações, Unimed e convênios, financeiro, auditoria e notificações do painel.

**Este arquivo é o contrato que o front usa (regra 3 do `../CLAUDE.md`): rota, permissão, corpo, resposta e erro descritos aqui têm de bater com o código.** Mudou uma rota? Atualize a linha dela no mesmo commit.

- O *porquê* de cada regra, migrations de dados e mudanças passadas ficam no `HISTORICO.md`.
- O detalhe de cada campo está no Swagger (`/docs`).

## Stack

- Node.js 22 + TypeScript, ESM (`"type": "module"`; import interno com extensão `.js`).
- Fastify 5: `@fastify/multipart` (upload), `@fastify/rate-limit`, `@fastify/cors`, `@fastify/swagger(-ui)`.
- Prisma 7 com `@prisma/adapter-pg` (PostgreSQL). Client gerado em `src/generated/prisma/` (não editar, não versionado).
- JWT (`jsonwebtoken`) + bcrypt; Zod para validação e env; sharp para imagens; Supabase Storage para arquivos públicos.
- Vitest: unitários em `src/**/__tests__/*_test.ts`, E2E em `src/e2e/*.e2e_test.ts`.

## Variáveis de ambiente

Validadas com Zod em `src/config/env.ts`; faltando obrigatória, o servidor não sobe.

```
DATABASE_URL=            # obrigatória
JWT_SECRET=              # obrigatória, mínimo 32 caracteres
PORT=3000
NODE_ENV=development     # development | production | test
CORS_ORIGIN=*            # lista separada por vírgula; "*" = qualquer origem, sem credentials
SUPABASE_URL=            # opcional no Zod, mas sem ela os uploads falham
SUPABASE_SECRET_KEY=     # idem (sb_secret_..., acesso total, só no servidor)
STORAGE_BUCKET=avatars
BANNER_BUCKET=course-banners
NEWS_BANNER_BUCKET=news-banners
```

Fora do Zod, lidas direto do `process.env`:
- `ENABLE_DOCS=true`: liga o Swagger em produção (`index.ts`; fora de produção ele sempre sobe).
- `GEOIP_DISABLED=1`: não consulta o local do IP na auditoria (`lib/geoip.ts`; com `NODE_ENV=test` também não consulta).

Os buckets precisam existir no Supabase e ser públicos.

## Arquitetura (hexagonal)

```
src/
  index.ts                 servidor: plugins, parser JSON, CORS, rate limit global, Swagger, rotas
  config/env.ts            env validado
  http/
    register-routers.ts    todas as rotas (usado pelo servidor e pelo app dos E2E)
    audit-hooks.ts         trilha de auditoria (hooks globais)
    error-handler.ts       apiErrorHandler
    router/                um plugin Fastify por módulo (schema Swagger + handler)
    controllers/           leem a request, checam permissão, chamam o use case
    lib/                   require-permission.ts, public-rate-limit.ts, swagger-schemas.ts
  usecase/                 regras de negócio (sem Fastify; Prisma só pelos ports)
  ports/external/          interfaces dos repositórios
  adapter/database/        implementações Prisma dos ports; list-filters.ts; prisma-errors.ts
  adapter/storage/         Supabase Storage (createStorageAdapter)
  lib/                     utilitários puros (datas, CPF, CSV, auditoria, imagens, listas fixas…)
  errors/                  erros tipados
  scripts/                 scripts avulsos (seed local, normalização antiga)
  e2e/                     testes E2E + helpers
```

Exceções conhecidas à regra "Prisma só no adapter":
- `http/router/audit-router.ts`, `http/audit-hooks.ts` e `adapter/database/audit-cleanup.ts` falam com `AuditLog` direto, sem port.
- `usecase/register-for-course-full.ts` recebe o `PrismaClient` e monta os adapters dentro da transação.

## Convenções que valem para tudo

**Horário "de parede".**
- Datas de curso, reserva de sala e agendamento/data de notícia são a hora de Brasília rotulada em UTC: `2026-10-05T08:00:00.000Z` = 08:00 em Terra Roxa.
- O painel monta a string; o backend não converte fuso. O dia é `iso.slice(0, 10)`.
- "Agora" nesse formato é `nowWallClock()` (`usecase/news-visibility.ts`); "hoje" é `todayInBrazil()` (`lib/quote-products.ts`, 00:00 do dia de Brasília com Z).
- Instantes de verdade, como criado em, banners (`-03:00` explícito) e auditoria, são UTC normal.

**Soft-delete — as duas regras.**
1. *Antes de excluir*, barra só o que ainda está vivo e vai acontecer: sala presa por curso/reserva que não terminou, regra presa por administrador ativo. Registro já excluído ou coisa que já passou nunca barra.
2. *Ao excluir*, o que só existe por causa do registro cai junto, na mesma transação. Ex.: excluir pessoa leva login, convite não usado, inscrições ativas, escala de instrutor, Unimed, propriedades, relações, contato público e vínculos com empresas.

Nada disso é apagado de verdade; só sai das telas. Têm `isDeleted`: UserAdmin, UserData, UserInstructor, CourseInstructor, course, CoursePhoto, room, RoomBooking, News, courseUserRegistration, Property, Banner, ContactMessage, UserRelation, UnimedBeneficiario, Company e os modelos de categoria, caixa, lançamento, recorrência e forma de pagamento do financeiro. Todos esses têm `isDeleted` + `deletedAt`.

**Valor único + soft-delete.** Um `@unique` cheio conta as linhas excluídas e prende o valor para sempre. Há duas saídas:
- **Índice parcial** `WHERE "isDeleted" = false`, quando o valor deve voltar a ficar livre: CPF de pessoa, inscrição ativa no curso, `UserAdmin.username`, nome da sala, CNPJ de empresa. Vai na migration (não dá para escrever no schema).
- **Upsert que revive a linha**, quando é o mesmo registro voltando: `UnimedBeneficiario` por pessoa, `UserInstructor`, `CourseInstructor` por (instrutor, curso), forma de pagamento por nome.

Conferência de conflito em use case enxerga só os ativos; sem uma das duas saídas o `create` estoura P2002.

**Erro do banco não vira "não encontrado".** O adapter devolve `null`/`false` só quando o registro não existe: `catch (e) { return semRegistro(e, null) }` (`adapter/database/prisma-errors.ts`) reconhece P2025/P2001/P2016/P2018 e **relança** o resto. Nada de `catch {}` mudo.

**Tipos do Prisma.**
- O `PrismaClient` vem de `src/generated/prisma/client.js`, nunca de `@prisma/client/extension`, que é `any` e desliga a conferência.
- Campo inexistente dentro de um `where` não é pego na compilação (estoura em execução), e filtro faltando (o `isDeleted` esquecido) só o teste pega.
- Coluna enum vai tipada com o enum do Prisma nos ports (`gender`, `maritalStatus`, `ethnicity`, `educationLevel`, `memberStatus`, `AddressType`, `QuotePeriod`…).

**Texto e links.**
- Nomes de cadastro (pessoa, sala, títulos de vínculo) são normalizados com `lib/text.ts` (`upperNoAccents`).
- Título de curso, de reserva e de notícia vão como digitados, porque aparecem no site.
- Links salvos aceitam só `http(s)` (`httpUrl` em `usecase/company-schema.ts`). Botão do banner também aceita caminho do site.

**Busca sem acento** (`adapter/database/list-filters.ts`, usada nas listas e nas exportações).
- **Texto:** "joao" acha "João". Os nomes são comparados nas colunas `*Search` com `searchKey(termo)`. São elas: `UserData.nameSearch`, `Company.nameSearch`/`tradeNameSearch`, `course.nameSearch`, `RoomBooking.titleSearch`. Um trigger as preenche (`*_fill_search`, função `immutable_unaccent_lower`); a aplicação nunca grava nelas.
- **CPF e CNPJ:** só entram quando o termo parece documento (números e `.-/()+`), comparando os dígitos.
- **Telefone:** mesma regra, a partir de 3 dígitos, em `phone`/`phone2`/`phone3`. Procura pelos dígitos e pelo termo digitado, porque cadastros antigos têm máscara.

**Imagens e arquivos.**
- Imagem pública passa por `validateImageUpload` (JPG, PNG, WEBP ou GIF, até 15 MB) e é regravada pelo sharp antes do bucket. Vale para capa de curso, notícia, banner, galeria da home e logo de convênio.
- O logo de parceiro também passa pelo sharp, mas com lista própria: só JPG, PNG e WEBP.
- Exceções, que ainda vão como chegaram (só validadas): o avatar e a foto da galeria do curso.
- PDF de ficha de inscrição e comprovante do financeiro ficam **no banco** (`Bytes`), nunca em bucket.

## Autenticação e permissões

**Token.**
- `POST /auth/login` devolve um JWT de 8 h (`ADMIN_TOKEN_TTL`) com `{ userId (= UserAdmin.id), username, role, authTime }`.
- `POST /auth/refresh` troca um token ainda válido por outro de 8 h, enquanto o admin existir (não excluído, com regra) e o login tiver sido há no máximo 24 h (`ADMIN_SESSION_MAX_SECONDS`). Fora disso → 401.
- O painel renova sozinho. O header é `Authorization: Bearer <token>`.

**Checagem por rota**, no controller (`http/lib/require-permission.ts`), com estas respostas em todas as rotas:
- `requirePermission(req, reply, 'X', getAdminPermissions)`: sem token ou token inválido → 401 `{ error: "Unauthorized" }`; admin excluído/sem regra → 401 `{ error: "Admin not found" }`; sem a permissão → 403 `{ error: "Forbidden" }`.
- `requireAuth(...)`: só o login (rotas de "Minha conta" e o sino).
- Rota com duas permissões chama `requirePermission` duas vezes (junção de cadastros, exportação `cadastros`).
- O `security` do schema Swagger é só documentação. Rota nova sem checagem fica aberta, e nenhum teste avisa (a decisão 001 da Arquitetura propõe declarar na rota).

**Permissões.**
- Não são hierárquicas: `READ_USER_ADMIN` não inclui `READ_USER`.
- O enum `Permission` (`prisma/schema.prisma`) tem 40: `CREATE_/UPDATE_/DELETE_/READ_` × `USER`, `COURSE`, `RULE`, `USER_ADMIN`, `NEWS`, `BANNER`, `MARKET_QUOTE`, `FINANCE` e `CONVENIO`, mais `READ_CONTACT`, `UPDATE_CONTACT`, `READ_AUDIT` e `UPDATE_AUDIT`.
- `CREATE_MARKET_QUOTE` e `DELETE_MARKET_QUOTE` existem mas nenhuma rota usa.
- As regras aceitam qualquer valor do enum (`Object.values(Permission)` em `rule-router.ts`).

**Permissão nova só chega a uma regra por migration.**
- Nada no servidor cria nem atualiza regra ao subir (não existe mais inicialização automática, ver `HISTORICO.md`).
- Ao criar uma permissão, a migration que a põe no enum também a concede às regras que fizer sentido. Exemplos: `*_CONVENIO` para quem tinha `UPDATE_BANNER`, `UPDATE_AUDIT` para quem tinha `READ_AUDIT`.
- Sem isso, ninguém, nem o super admin, consegue usar a rota nova.

**Banco novo não tem admin.**
- O primeiro precisa ser inserido à mão: uma `Rule` com todas as permissões, um `UserData` e um `UserAdmin` com hash bcrypt.
- Em desenvolvimento, `npx tsx src/scripts/seed-local-e2e.ts` (só com `DATABASE_URL` local) cria regra, admin e pessoas de exemplo.
- `prisma/limpeza-inicial.sql` zera um banco mantendo um admin escolhido.

**Anti-escalonamento** (`usecase/admin-guards.ts`). "Mais forte" = tem alguma permissão que quem pede não tem (`exceedsActor`).
- Criar, convidar, editar ou excluir admin exige que a regra dele, a atual **e** a nova, caiba nas permissões de quem pede. Senão → 403.
- Editar regra exige que ela caiba nas permissões de quem pede, mesmo só para renomear ou tirar permissões → senão 403.
- Excluir admin, ou a pessoa dele (que leva o login junto), passa por `checkAdminRemoval`:
  - não a si mesmo → 400;
  - não quem é mais forte → 403;
  - nunca o último admin ativo → 400.

**Limites por IP** (`@fastify/rate-limit`, contado por `request.ip`).
- **Global:** 600/min. O IP real vem do proxy por `trustProxy` em `index.ts`; a decisão 002 da Arquitetura trata da topologia.
- **Login e refresh:** 10 a cada 5 min.
- **`PATCH /admin/me`:** 10 a cada 5 min.
- **Rotas públicas** (`http/lib/public-rate-limit.ts`): inscrição (`register`, `register-by-cpf`, `register-full`) e `POST /contacts/message` com 10/min; `GET /users/lookup-cpf/:cpf` com 20/min.
- Cada rota conta separado. O excesso nas rotas públicas responde 429 `{ error: "Muitas tentativas seguidas. Aguarde um minuto e tente de novo." }`; no login, a mensagem padrão do plugin.

## Erros

Use case devolve `{ error?: Error; ...resultado }`; sem `error` = sucesso. O controller responde `reply.status(errorToStatus(error)).send({ error: error.message })` e nunca chama `send` duas vezes. Toda resposta de erro é `{ error: string }`.

`errorToStatus` (`http/lib/require-permission.ts`):

```
NotFoundError      → 404
ConflictError      → 409
BusinessRuleError  → 409
ForbiddenError     → 403
AuthError          → 401
qualquer outro     → 400   (ValidationError, Error, e também error ausente)
```

O que o use case **lança** (em vez de devolver) cai no `apiErrorHandler` (`http/error-handler.ts`):
- validação do JSON schema (Ajv) → 400 com a mensagem do Ajv;
- P2002 → 409 "Registro já existe (dados únicos em conflito).";
- P2003 → 409 "Registro em uso e não pode ser removido.";
- erro com `statusCode` < 500 (ex.: 429 do rate limit) → esse status com a mensagem;
- o resto → 500 "Erro interno do servidor." e `request.log.error`.
- `ValidationError` lançado tem `statusCode = 400` → 400 com a mensagem. Filtro de consulta validado com `parseQuery` (`errors/validation.ts`) sai assim: "Parâmetro inválido: <campo>".
- Atenção: JSON malformado no corpo hoje cai aqui como 500 (o parser de `index.ts` não põe `statusCode`).

**Regra das listagens:** sempre 200, com lista vazia ou página zerada. 404 só em detalhe ou ação sobre id inexistente.

Classes (`src/errors/`; as bases aceitam mensagem opcional e são usadas direto com texto em vários use cases):

| Base (arquivo) | Filhas |
|---|---|
| `AuthError` (`auth.ts`) | `InvalidCredentialsError` "Invalid username or password" |
| `ForbiddenError` (`auth.ts`, estende `Error`) | mensagem por parâmetro (padrão "Sem permissão para esta ação.") |
| `BusinessRuleError` (`business-rule.ts`) | `RoomAlreadyBookedError` (mensagem por parâmetro: "Sala ocupada: …"), `RegistrationsUnavailableError`, `RegistrationDeadlinePassedError` "Prazo de inscrição encerrado.", `CourseFullError` "Curso lotado — sem vagas disponíveis." |
| `ConflictError` (`conflict.ts`, 18 filhas) | `CpfAlreadyInUseError` "CPF já cadastrado para outra pessoa.", `RgAlreadyInUseError`, `RuleInUseError`, `RoomNameAlreadyExistsError`, `RoomHasCoursesError`, `RoomHasBookingsError`, `UsernameAlreadyExistsError`, `AdminAccountAlreadyExistsError`, `CourseRegistrationAlreadyExistsError`, `InstructorAlreadyExistsError`, `InstructorAlreadyAssignedError`, `UnimedBeneficiarioAlreadyExistsError`, `ConvenioSlugAlreadyExistsError`, `CompanyCnpjAlreadyExistsError`, `PublicContactAlreadyExistsError`, `CompanyMemberAlreadyExistsError`, `MergeDifferentCpfError`, `MergeBothHaveLoginError` |
| `NotFoundError` (`not-found.ts`, 29 filhas) | `CourseNotFoundError` "Course not found", `UserNotFoundError`, `UserDataNotFoundError` "Invalid userDataId: user not found", `AdminNotFoundError`, `NewsNotFoundError`, `RoomNotFoundError`, `RuleNotFoundError`, `RoleNotFoundError`, `PermissionRuleNotFoundError`, `RegistrationNotFoundError`, `PhotoNotFoundError`, `UserRelationNotFoundError`, `PropertyNotFoundError`, `AddressNotFoundError` "CEP not found", `InstructorNotFoundError`, `ContactMessageNotFoundError`, `BannerNotFoundError`, `MarketQuoteNotFoundError`, `AdminInviteInvalidError` "Convite inválido, expirado ou já utilizado.", `FinanceCategoryNotFoundError`, `FinanceTransactionNotFoundError`, `UnimedBeneficiarioNotFoundError`, `GalleryAlbumNotFoundError`, `GalleryPhotoNotFoundError`, `ConvenioNotFoundError`, `CompanyNotFoundError`, `PublicContactNotFoundError`, `CompanyMemberNotFoundError`, `RoomBookingNotFoundError` |
| `ValidationError` (`validation.ts`, estende `Error`) | mensagem obrigatória → 400 |

Fora de `src/errors/`:
- `CourseEndedError` (BusinessRule, `lib/course-registration-rules.ts`): "Este curso já terminou e não aceita mais inscrições.";
- `CourseNotInProgressError` (BusinessRule, `usecase/complete-course.ts`);
- `PersonAlreadyRegisteredError` (Conflict, `usecase/admin-course-registrations.ts`): "Pessoa já inscrita neste curso".

## Paginação e filtros

Listas paginadas aceitam `?page=1&limit=20` e respondem `{ data, total, page, limit, totalPages }`. O schema aceita `limit` até 1000, mas vários controllers cortam em 100.

| Rota | Filtros |
|---|---|
| `GET /admin/users` | `search` (nome/e-mail sem acento; CPF e telefone com ou sem máscara), `memberType`, `memberClassification`, `gender`, `ethnicity`, `educationLevel`, `incompleteRegistration` (true = falta foto, propriedade, CPF, nascimento ou sexo; RG não conta), `activeMember` (true = `memberStatus ACTIVE` com validade vazia ou ≥ hoje) |
| `GET /admin/users/admins` | `search` (usuário), `rulesId` |
| `GET /admin/companies` | `search`, `type`, `isPartner` |
| `GET /admin/unimed` | `search` (nome/CPF/telefone da pessoa), `userDataId` |
| `GET /admin/courses` | `status` (os 5), `search` (nome ou nº do evento), `year` (ano do início) |
| `GET /admin/news` | `status` = PUBLISHED (no ar) / SCHEDULED (agendada) / UNPUBLISHED (rascunho), `search` (título) |
| `GET /admin/contacts/messages` | `read`, `search` |
| `GET /admin/audit-logs` | ver Auditoria |
| `GET /admin/finance/transactions` | ver Financeiro |

## Rotas

Autenticação na última coluna: **Pública**, **Login** (qualquer admin) ou a permissão exigida.

### Saúde e endereço
| Método | Path | O que faz | Auth |
|---|---|---|---|
| `GET` | `/` | `{ status: 'ok', uptime }` | Pública |
| `GET` | `/address/cep/:cep` | `FetchAddressByCepUseCase`, endereço pelo CEP; CEP inexistente → 404 "CEP not found" | Pública |

### Login
| Método | Path | O que faz | Auth |
|---|---|---|---|
| `POST` | `/auth/login` | `{ username, password }` → `{ token }`; errado → 401; 10 por 5 min | Pública |
| `POST` | `/auth/refresh` | token válido → token novo (ver Autenticação) | Login (o próprio token) |

### Minha conta
| Método | Path | O que faz | Auth |
|---|---|---|---|
| `GET` | `/admin/me` | `{ userId, userDataId, username, name, avatar, rulesId, ruleName, permissions[], dashboardPrefs }` (`userId` = UserAdmin.id) | Login |
| `PATCH` | `/admin/me` | `UpdateMeUseCase`: `{ name?, username?, password?, currentPassword? }` → `{ message: 'ok' }` | Login |
| `PATCH` | `/admin/me/preferences` | `{ dashboardPrefs: {...} }` → `{ dashboardPrefs }` | Login |
| `POST` | `/admin/me/avatar` | multipart → `{ avatarUrl }`; troca a foto do `UserData` do próprio admin | Login |

**`PATCH /admin/me`:**
- Trocar a senha exige `currentPassword` junto com `password` (a nova, com 8+ caracteres).
- Sem `currentPassword` → 400 "Informe a senha atual para trocar a senha.". Errada → 400 "Senha atual incorreta.". É 400 e não 401 porque o painel trata 401 como sessão vencida.
- Com erro, nada do pedido é gravado.
- Nome e usuário (3+ caracteres) sozinhos não pedem a senha. Usuário de outro admin → 409.
- 10 pedidos por 5 min por IP.
- Os tokens já emitidos continuam valendo depois da troca: não há versão de token.

**Preferências:**
- O conteúdo é livre e **substitui o objeto inteiro**.
- Tem de ser objeto simples (null, array ou outro tipo → 400) de no máximo 4 KB em JSON (`MAX_PREFS_BYTES`).
- `null` em `GET /admin/me` enquanto nunca salvou.

**Avatar:** imagem até 15 MB, gravada como veio no bucket `avatars`.

### Pessoas (UserData)
| Método | Path | O que faz | Auth |
|---|---|---|---|
| `POST` | `/users` | `CreateUserUseCase` — formulário do painel; `{ name, phone, cpf, email? }` → 201 | `CREATE_USER` |
| `GET` | `/admin/users` | `ListUsersUseCase` (paginada, filtros acima) | `READ_USER` |
| `GET` | `/admin/users/:id` | `GetUserDetailUseCase` (ficha completa) | `READ_USER` |
| `PATCH` | `/users/:id` | `UpdateUserDataUseCase` | `UPDATE_USER` |
| `DELETE` | `/users/:id` | `DeleteUserDataUseCase` → 204 (soft, leva junto o que depende da pessoa) | `DELETE_USER` (+ `DELETE_USER_ADMIN` se a pessoa tem login) |
| `POST` | `/admin/users/:id/avatar` | multipart → `{ avatarUrl }` | `UPDATE_USER` |
| `GET` · `POST` | `/admin/users/:id/relations` | listar · criar relação `{ targetId, label? }` (a inversa, B→A, é criada sozinha, sem rótulo) | `READ_USER` · `UPDATE_USER` |
| `DELETE` | `/admin/users/:id/relations/:relationId` | remover relação | `UPDATE_USER` |
| `GET` · `POST` | `/admin/users/:id/properties` | listar · criar propriedade da pessoa | `READ_USER` · `UPDATE_USER` |
| `PATCH` · `DELETE` | `/admin/users/:id/properties/:propertyId` | editar · excluir (dono errado → 404) | `UPDATE_USER` |
| `GET` | `/admin/users/duplicates?limit=50` | cadastros repetidos | `READ_USER` |
| `GET` | `/admin/users/merge-preview?ids=a,b` | os dois lado a lado | `READ_USER` |
| `POST` | `/admin/users/merge` | `{ keepId, removeId }` | `DELETE_USER` **e** `UPDATE_USER` |

> Atenção: `GET /admin/users/:id` é a ficha da **pessoa**; `PATCH`/`DELETE /admin/users/:id` são do **administrador** (UserAdmin).

**Cadastro e edição:**
- Nome, telefone e CPF são obrigatórios no cadastro. E-mail é opcional: vazio ou null = sem e-mail; preenchido, tem de ser válido (`lib/person-email.ts`).
- E-mail e telefone podem repetir entre pessoas.
- CPF de outra pessoa ativa → 409 "CPF já cadastrado para outra pessoa."; RG repetido → 409.
- `UserDataAdapter` grava CPF só com dígitos e e-mail normalizado.
- `memberType` vem da lista fixa (`lib/member-types.ts`); fora dela → 400.
- `cadPro` aceita até 5 itens.
- O endereço da pessoa é o de uma propriedade, a principal em `primaryPropertyId`. Não há endereço direto na pessoa.

**Excluir pessoa:**
- Sem login no painel, basta `DELETE_USER`.
- Com login, exige também `DELETE_USER_ADMIN` → senão 403 "Esta pessoa tem acesso ao painel: excluí-la exige também a permissão de excluir administradores.".
- Com login, passa também por `checkAdminRemoval`:
  - o próprio cadastro → 400;
  - administrador mais forte → 403;
  - último admin ativo → 400.

**Cadastros repetidos** (`usecase/merge-users.ts`, `adapter/database/user-merge-adapter.ts`). A inscrição pública acha a pessoa só pelo CPF, então quem estava sem CPF ganha um segundo cadastro.
- **`duplicates`** → `{ groups: [{ key, reason: NOME|TELEFONE|EMAIL, people: [{ id, name, cpf, email, phone, createdAt, hasLogin, counts: { registrations, companies, properties, relations } }] }] }`.
  - Junta pessoas ativas com o mesmo `nameSearch`, telefone (dígitos) ou e-mail, desde que **ao menos uma esteja sem CPF**.
  - O mesmo par sai uma vez só.
  - `hasLogin` = existe `UserAdmin` (mesmo excluído).
- **`merge`** → `{ keepId, removedId, movedRegistrations, movedCompanies, movedProperties, movedRelations, filledFields[] }`. Numa transação, passam de `removeId` para `keepId`:
  - inscrições: as duplicadas no mesmo curso → fica a de `keepId`;
  - vínculos com empresa: o repetido → fica o título de `keepId`;
  - propriedades e relações nos dois sentidos;
  - Unimed (e `titularId`), contato público e instrutor, só quando `keepId` não tem o seu;
  - `UserAdmin`, `AdminInvite` e `RoomBooking.responsibleUserDataId`.
  - Depois, os campos **vazios** de `keepId` são preenchidos com os do removido, que vira `isDeleted`. O removido é excluído **antes** de o CPF passar.
  - Recusa: mesmo id ou cadastro já excluído → 400; CPFs diferentes → 409; os dois com login → 409.

### Empresas e parceiros (`company-router.ts`, `usecase/company-usecases.ts`)
| Método | Path | O que faz | Auth |
|---|---|---|---|
| `GET` | `/admin/companies` | lista (search, type, isPartner) | `READ_USER` |
| `GET` | `/admin/companies/titles` | títulos já usados nos vínculos | `READ_USER` |
| `GET` | `/admin/companies/:id` | detalhe com membros e propriedades | `READ_USER` |
| `POST` | `/admin/companies` | criar (aceita `tradeName` e `address` da sede) | `CREATE_USER` |
| `PATCH` | `/admin/companies/:id` | editar dados, parceria, `primaryPropertyId`; `address` null/vazio remove | `UPDATE_USER` |
| `DELETE` | `/admin/companies/:id` | soft | `DELETE_USER` |
| `POST` · `PATCH` · `DELETE` | `/admin/companies/:id/members[/:memberId]` | vínculo pessoa × empresa `{ userDataId, title }` (repetido → 409) | `UPDATE_USER` |
| `POST` · `PATCH` · `DELETE` | `/admin/companies/:id/properties[/:propertyId]` | propriedades da empresa | `UPDATE_USER` |
| `POST` | `/admin/companies/:id/partner-logo` | logo de parceiro (multipart) | `UPDATE_USER` |
| `GET` | `/partners` | empresas parceiras ativas, na ordem | Pública |
| `PATCH` | `/admin/partners/reorder` | `{ order: companyId[] }` | `UPDATE_USER` |

CNPJ é gravado só com dígitos e é único entre as empresas ativas → 409 "Já existe uma empresa ativa com este CNPJ.". `Property` tem exatamente um dono, pessoa **ou** empresa (CHECK `Property_single_owner`).

### Administradores e convites
| Método | Path | O que faz | Auth |
|---|---|---|---|
| `GET` | `/admin/users/admins` | lista (search, rulesId) | `READ_USER_ADMIN` |
| `POST` | `/admin/users` | `CreateUserAdminUseCase`: `{ username, password, userDataId, userRole }` → 201 | `CREATE_USER_ADMIN` |
| `PATCH` | `/admin/users/:id` | `UpdateUserAdminUseCase`: `{ username?, password?, rulesId? }` | `UPDATE_USER_ADMIN` |
| `DELETE` | `/admin/users/:id` | `DeleteUserAdminUseCase` → 204 | `DELETE_USER_ADMIN` |
| `POST` | `/admin/invites` | `{ userDataId, rulesId }` → 201 `{ token, expiresAt }` (7 dias) | `CREATE_USER_ADMIN` |
| `GET` | `/admin/invites` | pendentes (sem uso, inclusive vencidos) → `[{ id, userName, ruleName, expiresAt, createdAt, expired }]`; nunca mostra o token | `READ_USER_ADMIN` |
| `DELETE` | `/admin/invites/:id` | revogar (apaga) → 204; inexistente → 404 | `CREATE_USER_ADMIN` |
| `GET` | `/invites/:token` | `{ userName, ruleName }`; inválido, vencido ou usado → 404 "Convite inválido, expirado ou já utilizado." | Pública |
| `POST` | `/invites/:token/accept` | `{ username, password }` → `{ message: 'ok' }` (não loga; a pessoa entra depois) | Pública |

**Cadastro de admin:**
- Senha com 8+ caracteres → 400 "A senha deve ter ao menos 8 caracteres.".
- Usuário não vazio, gravado sem os espaços das pontas → 400 "Informe o usuário.".
- Usuário de outro admin ativo → 409. A pessoa já ser admin ativa → 409.
- Admin excluído da mesma pessoa é **reativado** na mesma linha.
- Regra mais forte que a de quem pede → 403.

**Edição:** recusa (403) mexer em admin mais forte que quem pede, e dar a ele regra mais forte.

**Exclusão:** passa por `checkAdminRemoval`.

**Convite:**
- 32 bytes base64url, uso único: o consumo é atômico e só pega convite não usado.
- O aceite cria (ou reativa) o `UserAdmin`, exige usuário com 3+ caracteres e senha com 8+, e publica `INVITE_ACCEPTED`.
- Fica fora da auditoria.
- Convidar com regra mais forte → 403. Pessoa que já é admin ativa → 409.

### Regras
| Método | Path | O que faz | Auth |
|---|---|---|---|
| `GET` | `/admin/rules` | lista paginada | `READ_RULE` |
| `POST` | `/rules` | `{ name, permissions[] (1+), description? }`; permissão além das de quem pede → 403 | `CREATE_RULE` |
| `PATCH` | `/rules/:ruleId` | editar; regra mais forte que a de quem pede, ou permissão além das dele → 403 | `UPDATE_RULE` |
| `DELETE` | `/rules/:ruleId` | apaga de verdade → 204 | `DELETE_RULE` |

**Excluir regra:**
- Admin ativo usando a regra → 409 "Regra em uso por um ou mais administradores — não pode ser removida.".
- Só admin excluído usando → 409 genérico da FK ("Registro em uso…").
- Não confere se a regra é mais forte que a de quem pede.

### Contatos públicos ("Nossa equipe") (`public-contact-router.ts`)
| Método | Path | O que faz | Auth |
|---|---|---|---|
| `GET` | `/contacts` | `[{ publicTitle, userData: { name, email, phone, avatar } }]`, na ordem | Pública |
| `GET` | `/admin/public-contacts` | lista | `READ_USER` |
| `POST` | `/admin/public-contacts` | `{ userDataId, title }`; entra no fim; pessoa inexistente → 404, repetida → 409 | `UPDATE_USER` |
| `PATCH` | `/admin/public-contacts/reorder` | `{ order: id[] }` com todos os ids | `UPDATE_USER` |
| `PATCH` · `DELETE` | `/admin/public-contacts/:id` | editar cargo · remover | `UPDATE_USER` |

### Mensagens do formulário de contato
| Método | Path | O que faz | Auth |
|---|---|---|---|
| `POST` | `/contacts/message` | `{ name, email, phone?, subject?, message }` → 201; publica `CONTACT_MESSAGE`; 10/min por IP | Pública |
| `GET` | `/admin/contacts/messages` | paginada (read, search) | `READ_CONTACT` |
| `PATCH` | `/admin/contacts/messages/:messageId` | marca como lida | `UPDATE_CONTACT` |
| `PATCH` | `/admin/contacts/messages/:messageId/unread` | marca como não lida (rota própria para a auditoria saber qual foi) | `UPDATE_CONTACT` |
| `DELETE` | `/admin/contacts/messages/:messageId` | excluir | `UPDATE_CONTACT` |

### Configurações do site (`site-settings-router.ts`)
| Método | Path | O que faz | Auth |
|---|---|---|---|
| `GET` | `/site-settings` | todas as chaves (ausente = `''`) | Pública |
| `GET` · `PATCH` | `/admin/site-settings` | ler · gravar só o que veio (valida URLs, e-mail, UF) | `READ_BANNER` · `UPDATE_BANNER` |

Chaves: `social.*`, `org.*` (telefone, e-mail, endereço, horário, busca do mapa), `about.text`, `quotes.source` e `audit.retentionDays`.

### Unimed (`unimed-router.ts`)
Beneficiário 1:1 com a pessoa; aqui ficam só os campos do plano.

| Método | Path | O que faz | Auth |
|---|---|---|---|
| `GET` | `/admin/unimed` | paginada; `search`; `userDataId` = os cadastros da pessoa **e** aqueles em que ela é titular | `READ_USER` |
| `GET` | `/admin/unimed/:id` | detalhe | `READ_USER` |
| `POST` | `/admin/unimed` | criar; segundo cadastro ativo da mesma pessoa → 409 | `CREATE_USER` |
| `PATCH` | `/admin/unimed/:id` | editar | `UPDATE_USER` |
| `DELETE` | `/admin/unimed/:id` | soft | `DELETE_USER` |

- **Listas fixas** (`lib/unimed-options.ts`):
  - `tipoMovimento`: INCLUSAO DE TITULAR/DEPENDENTE, EXCLUSAO DE TITULAR/DEPENDENTE, ALTERACAO CADASTRAL, REATIVACAO.
  - `grauDependencia`: TITULAR, CONJUGE, FILHO(A), ENTEADO(A), PAI/MAE, OUTRO.
  - Fora da lista → 400, **menos** quando é o valor que já estava gravado no registro (legado). `plano` e `tipoDependente` são texto livre.
- **CNS:** gravado só com dígitos, 15 dígitos, com a mesma folga para o valor antigo.
- **Filtro inválido:** `userDataId` que não é UUID → 400 "Parâmetro inválido: userDataId".

### Convênios (`convenio-router.ts`, `usecase/convenio-usecases.ts`)
Páginas públicas de convênio (ex.: Unimed: tabela de preços, documentos, destaques).

| Método | Path | O que faz | Auth |
|---|---|---|---|
| `GET` | `/convenios` | menu: ativos `[{ id, slug, name, subtitle, logoUrl, order }]`, por `order` e nome | Pública |
| `GET` | `/convenios/:slug` | convênio completo; inexistente **ou inativo** → 404 "Convênio não encontrado" | Pública |
| `GET` | `/admin/convenios` · `/admin/convenios/:id` | todos (inclusive inativos) · um | `READ_CONVENIO` |
| `POST` | `/admin/convenios` | criar → 201 | `CREATE_CONVENIO` |
| `PATCH` | `/admin/convenios/:id` | editar (tudo opcional; `logoUrl: null` remove o logo) | `UPDATE_CONVENIO` |
| `DELETE` | `/admin/convenios/:id` | apaga de verdade → 204 (não há soft-delete) | `DELETE_CONVENIO` |
| `POST` | `/admin/convenios/:id/logo` | multipart → `{ logoUrl }`; sharp → PNG até 480×240 | `UPDATE_CONVENIO` |

- **Objeto:** `id, slug, name, title, subtitle, intro, logoUrl, priceLabelHeader, priceValueHeader, priceRows, priceNote, documentsTitle, documents, highlightsTitle, highlights, aboutTitle, aboutText, isActive, order, createdAt, updatedAt`.
- **Obrigatórios na criação:** `slug`, `name` (1–60) e `title` (1–120).
- **`slug`:** minúsculas, números e hífens (`^[a-z0-9]+(?:-[a-z0-9]+)*$`), até 60 caracteres, único. Repetido → 409 "Já existe um convênio com este endereço de página.".
- **`priceRows`:** `[{ label (1–60), priceCents (0–100.000.000) }]`, no máximo 60 linhas.
- **`documents` e `highlights`:** `string[]` de itens com 1 a 160 caracteres, no máximo 40.
- **Textos opcionais:** `""` vira null.

### Instrutores
| Método | Path | O que faz | Auth |
|---|---|---|---|
| `POST` · `PATCH` · `DELETE` | `/admin/users/:id/instructor` | tornar instrutor (upsert, revive) · editar bio/redes · deixar de ser (soft) | `UPDATE_USER` |
| `GET` | `/admin/instructors` | instrutores ativos | `READ_USER` |
| `POST` | `/admin/courses/:courseId/instructors` | escalar no curso `{ instructorUserDataId, title?, category? }`; repetido → 409 | `UPDATE_COURSE` |
| `DELETE` | `/admin/courses/:courseId/instructors/:assignmentId` | tirar do curso | `UPDATE_COURSE` |

### Cursos (`course-router.ts`)
| Método | Path | O que faz | Auth |
|---|---|---|---|
| `GET` | `/courses?page&limit[&ended]` | `ListCoursesUseCase`, só `PUBLIC` (ordem abaixo) | Pública |
| `GET` | `/courses/:courseId` | detalhe de **qualquer** status (página aberta pelo link) | Pública |
| `POST` | `/courses` | `CreateCourseUseCase` (+ cópia ao duplicar) → 201 `{ id, coverCopied?, instructorsCopied? }` | `CREATE_COURSE` (+ `UPDATE_COURSE` para copiar capa/instrutores) |
| `PATCH` | `/courses/:courseId` | `UpdateCourseUseCase` | `UPDATE_COURSE` |
| `DELETE` | `/courses/:courseId` | soft (leva fotos e inscrições) | `DELETE_COURSE` |
| `POST` | `/courses/:courseId/banner` | capa (multipart) → `{ url, thumbUrl }` | `UPDATE_COURSE` |
| `POST` · `DELETE` | `/courses/:courseId/gallery[/:photoId]` | foto da galeria do curso | `UPDATE_COURSE` |
| `GET` | `/admin/courses` | paginada (status, search, year), formato de card | `READ_COURSE` |
| `GET` | `/admin/courses/years` | `number[]`: anos de início com curso, do mais recente | `READ_COURSE` |
| `GET` | `/admin/courses/:courseId` | detalhe do painel | `READ_COURSE` |

**`GET /courses`** (contrato de out/2026):
- **Grupos:** primeiro os cursos que **não terminaram** (em andamento e próximos), do início mais cedo para o mais tarde. Depois os **terminados**, do mais recente para o mais antigo.
- **"Terminou"** = o dia do fim já passou em Brasília; no último dia, ainda não terminou. É a mesma regra da inscrição.
- **Paginação:** atravessa os dois grupos, e `total` conta os dois.
- **`ended`:** `include` (padrão) traz os terminados no fim; `exclude` tira os terminados da lista e do `total`. Outro valor → 400.
- **Status:** `PRIVATE` não aparece, mas a página abre e aceita inscrição pelo link. `IN_PROGRESS`, `COMPLETED` e `UNPUBLISHED` também ficam fora da lista.

**Datas e sala:**
- O término tem de ser depois do início → 400 "O término do curso precisa ser depois do início.". Vale sempre na criação; na edição, quando o pedido traz `startTime` ou `endTime`, comparando com o valor já gravado do outro.
- Sem CHECK no banco, de propósito: um curso antigo com datas trocadas continua editável no resto.
- Criar, e editar mudando sala ou horário, confere o conflito com cursos **e reservas** e grava numa transação só, com a sala travada (`createInRoom`/`updateInRoom`, a mesma trava `lockRoom` das reservas).
- Sala ocupada → `POST` 400 / `PATCH` 409 "Sala ocupada: Curso "X" em 05/10 08:00–12:00".

**Status:**
- O painel cria com `PUBLIC`, `PRIVATE` ou `UNPUBLISHED`.
- Iniciar e concluir têm rotas próprias (em Inscrições).
- Pela edição dá para concluir só a partir de `IN_PROGRESS` e desfazer (`IN_PROGRESS` ↔ `COMPLETED`).

**Capa:**
- Colunas `bannerUrl` (JPEG 1920×1080, `courses/<id>/banner.jpg`) e `bannerThumbUrl` (WebP 640×360); a API as expõe como `coverImage` e `coverImageThumb`.
- Miniatura null em curso antigo → o front usa a capa. Se a miniatura falha, vira null sem impedir a capa.

**Duplicar:**
- `copyCoverFromCourseId` baixa a capa só do próprio storage (`lib/download-image.ts`) e envia de novo.
- `copyInstructorsFromCourseId` + `instructorAssignmentIds` copiam os instrutores.
- Falha na cópia não desfaz o curso. A galeria não é copiada.

**Detalhe** (`/courses/:id` e `/admin/courses/:id`):
- `instructors[]` (`id, title, category, name, bio, avatar, linkedin, instagram, facebook`); `instructorName` (o primeiro instrutor) fica por compatibilidade.
- `registrationDeadline` ("AAAA-MM-DD") e `registrationDeadlineTime` ("HH:MM" ou null = o dia inteiro).

### Inscrições (`registration-router.ts`)
| Método | Path | O que faz | Auth |
|---|---|---|---|
| `GET` | `/users/lookup-cpf/:cpf` | `{ found, name }`, com o nome mascarado ("João D. S."); CPF inválido ou sem cadastro → `{ found: false, name: null }`; 20/min por IP | Pública |
| `POST` | `/courses/:courseId/register` | `{ name, phone, cpf, email? }` → 201 `{ registrationId, userDataId }` (cria a pessoa se o CPF é novo); 10/min | Pública |
| `POST` | `/courses/:courseId/register-by-cpf` | `{ cpf }` → 201; **CPF sem cadastro → 404** (o site segue para o `register-full`); 10/min | Pública |
| `POST` | `/courses/:courseId/register-full` | `{ name, phone, cpf, email?, rg?, birthDate?, address? }` → 201; cria a pessoa com o endereço como propriedade principal; 10/min | Pública |
| `GET` | `/admin/courses/:courseId/registrations` | inscritos com `confirmed`, `attended`, `ficha` (metadados), selos (memberStatus, membershipValidUntil, boardPosition, contato público, empresas parceiras) | `READ_COURSE` |
| `POST` | `/admin/courses/:courseId/registrations` | inscrição pela equipe `{ userDataId }`, já confirmada; ignora prazo, status e fim; respeita a lotação | `UPDATE_COURSE` |
| `PATCH` | `/admin/registrations/:registrationId/confirm` | `{ confirmed: boolean }` (confirma ou desconfirma) | `UPDATE_COURSE` |
| `PATCH` | `/admin/courses/:courseId/registrations/confirm-all` | confirma as pendentes → `{ confirmed }` | `UPDATE_COURSE` |
| `DELETE` | `/admin/registrations/:registrationId` | cancelar (soft) | `UPDATE_COURSE` |
| `POST` | `/admin/courses/:courseId/start` | status → `IN_PROGRESS` (exige ao menos uma inscrição; não confirmadas não impedem) | `UPDATE_COURSE` |
| `PATCH` | `/admin/courses/:courseId/complete` | `IN_PROGRESS` → `COMPLETED`, sempre à mão; outro status → 409 → `{ id, status }` | `UPDATE_COURSE` |
| `PATCH` | `/admin/registrations/:registrationId/attendance` | `{ attended: true\|false\|null }` → `{ id, attended }` | `UPDATE_COURSE` |
| `PATCH` | `/admin/courses/:courseId/registrations/attendance` | `{ attended: boolean }` nas confirmadas ainda sem marcar → `{ updated }` | `UPDATE_COURSE` |
| `POST` | `/admin/registrations/:registrationId/ficha` | ficha em PDF (multipart, até 15 MB) → 201 `{ filename }`; substitui a anterior | `UPDATE_COURSE` |
| `GET` | `/admin/registrations/:registrationId/ficha` | o PDF, inline; sem ficha → 404 "Ficha não encontrada." | `READ_COURSE` |
| `DELETE` | `/admin/registrations/:registrationId/ficha` | remove → 204 | `UPDATE_COURSE` |

**Regras da inscrição pública** (`lib/course-registration-rules.ts`, as três rotas), todas → 409:
- `UNPUBLISHED`/`IN_PROGRESS` → `RegistrationsUnavailableError`;
- `COMPLETED` ou o dia do fim já passou (em Brasília; no último dia ainda aceita) → `CourseEndedError`;
- prazo passado → `RegistrationDeadlinePassedError`. Prazo gravado sem hora (00:00) vale até o fim do dia; com hora, fecha quando o relógio de Brasília passa dela;
- lotado → `CourseFullError`;
- já inscrita → `CourseRegistrationAlreadyExistsError`.

O site usa a mesma regra (`utils/course-status.ts` no front).

**Pessoa na inscrição:**
- A pessoa é achada **só pelo CPF**. E-mail e telefone iguais aos de outra pessoa criam cadastro próprio.
- CPF criado ao mesmo tempo por outra inscrição → 409 "CPF já cadastrado para outra pessoa.".

**Vagas** (`lockCourseSeats` em `registration-adapter.ts`):
- Quem conta e insere trava as vagas do curso (`pg_advisory_xact_lock`) antes de contar, em READ COMMITTED: `createWithCapacity` (que atende `register`, `register-by-cpf` e a inscrição pela equipe) e o `register-full`.
- Inscrições ao mesmo tempo entram uma de cada vez: nunca passa da lotação, e quem chega depois da última vaga ouve 409.
- O `register-full` tenta de novo (até 3 vezes) num conflito de escrita que ainda apareça. `isPrismaSerializationError` reconhece o P2034 e o `DriverAdapterError` `TransactionWriteConflict` do adapter-pg.
- O erro inesperado vai para o `apiErrorHandler` (log + 500 genérico).

**Presença:**
- O painel mostra Presente/Faltou depois que o curso começou.
- Sai na planilha `registrations` (coluna "Presença").
- O sistema não emite certificado; quem emite é a FAEP.

### Salas
| Método | Path | O que faz | Auth |
|---|---|---|---|
| `GET` | `/rooms` | salas ativas | Pública |
| `POST` | `/rooms` | `{ name, description, maxCapacity }`; nome da lista fixa (`lib/room-names.ts`: AUDITORIO, COZINHA, SALA DE VIDEO CONFERENCIA, SALA 1, SALA 2, SALA APL), normalizado; repetido entre as ativas → 409 | `CREATE_COURSE` |
| `PATCH` | `/rooms/:roomId` | editar; pode manter nome antigo, trocar exige nome da lista | `UPDATE_COURSE` |
| `DELETE` | `/rooms/:roomId` | soft; curso ou reserva que **ainda não terminou** na sala → 409 | `DELETE_COURSE` |

`maxCapacity` da sala é a lotação dos cursos nela.

### Reservas de sala (`room-booking-router.ts`, `usecase/room-booking-usecases.ts`)
Eventos e reuniões que ocupam as salas, além dos cursos.

| Método | Path | O que faz | Auth |
|---|---|---|---|
| `GET` | `/events` | eventos publicados que não terminaram (`endTime >= agora`, Brasília), por início, até 50 → `{ id, title, description (= publicDescription), startTime, endTime, roomName }` | Pública |
| `GET` | `/admin/room-bookings?from&to[&roomId][&type][&search]` | reservas que sobrepõem o período | `READ_COURSE` |
| `GET` | `/admin/room-schedule?from&to[&roomId]` | agenda: cursos (qualquer status) + reservas | `READ_COURSE` |
| `POST` | `/admin/room-bookings` | criar (com `repeat` opcional) → 201 `{ ids, seriesId }` | `CREATE_COURSE` |
| `PATCH` | `/admin/room-bookings/:id` | editar só esta ocorrência | `UPDATE_COURSE` |
| `DELETE` | `/admin/room-bookings/:id?scope=one\|future` | soft → `{ deleted }` | `DELETE_COURSE` |

- **`from`/`to`** (`AAAA-MM-DD`): obrigatórios, `to >= from`, no máximo 370 dias. Delimitam `[from 00:00, to + 1 dia 00:00)`, sem paginação.
- **Item:** `{ id, type, title, description, publicOnSite, publicDescription, roomId, roomName, startTime, endTime, responsible: { id, name } | null, responsibleName, seriesId }`.
- **Agenda:** `{ kind: COURSE|EVENT|MEETING, id, title, roomId, roomName, startTime, endTime, status, seriesId, publicOnSite, enrolled, maxStudents, registrationDeadline, registrationDeadlineTime }`.
  - Os quatro últimos só vêm em curso.
  - Monta tudo em duas consultas. É o calendário do Painel Geral.
- **Criar:** `{ type, title (até 150), description?, publicOnSite?, publicDescription?, roomId, startTime, endTime, responsibleUserDataId?, responsibleName?, repeat?: { frequency: WEEKLY|MONTHLY, until } }`.
  - `repeat` gera uma ocorrência por semana ou por mês até `until` inclusive (mês sem o dia é pulado), no máximo 60, todas com o mesmo `seriesId`.
- **Editar:** só a ocorrência; `description`, `publicDescription`, `responsibleUserDataId` e `responsibleName` aceitam `null`.
- **No site:**
  - só `EVENT` é publicado; reunião é forçada a `publicOnSite: false`;
  - `description` é observação interna e nunca sai para o público.
- **Conflito** (`usecase/room-availability.ts`): mesma sala com `início < fim do outro` e `fim > início do outro` (encostar pode), contra cursos e reservas não excluídos.
  - Todas as ocorrências são conferidas dentro da transação, com a sala travada.
  - Qualquer conflito → nada é criado → 409 `Sala ocupada: Curso "X" em 05/10 08:00–12:00` (o primeiro conflito).
- **Excluir:** `scope=future` = esta e as próximas da série.

### Notícias (`news-router.ts`)
| Método | Path | O que faz | Auth |
|---|---|---|---|
| `GET` | `/news` | publicadas e já no ar, paginada | Pública |
| `GET` | `/news/:newsId` | detalhe; rascunho ou agendada → 404, mesmo com o link | Pública |
| `GET` | `/admin/news` | paginada (status, search) | `READ_NEWS` |
| `POST` | `/news` | `{ title, content, summary?, status?, publishedAt?, publishAt? }` → 201 | `CREATE_NEWS` |
| `PATCH` | `/news/:newsId` | editar | `UPDATE_NEWS` |
| `DELETE` | `/news/:newsId` | soft | `DELETE_NEWS` |
| `POST` | `/news/:newsId/banner` | capa (multipart) → `{ url }`; JPEG até 1920 px | `UPDATE_NEWS` |
| `POST` | `/news/:newsId/image` | imagem do texto (multipart) → `{ url }`; JPEG até 1600 px | `UPDATE_NEWS` |

**Agendamento** (`publishAt`, `usecase/news-visibility.ts`):
- Hora de parede de Brasília com Z. `null` = no ar assim que o status for `PUBLISHED`; no futuro = só aparece depois.
- Rascunho nunca guarda agendamento. Vale o status de depois do pedido: um `PATCH` sem `status` num rascunho também descarta.

**`publishedAt`** (a data mostrada ao leitor):
- Mesma convenção, hora de parede.
- Quando não vem no corpo: agendada → a data do agendamento; entrando no ar agora → `nowWallClock()`, se ainda não tinha data ou se a que tinha era de um agendamento que não chegou ("publicar agora" uma agendada); senão não muda.
- Notícias antigas publicadas "agora" guardam o instante real em UTC (até 3 h à frente).

**Imagens:**
- `validateImageUpload` + `toJpeg`: o arquivo gravado é sempre um JPEG gerado pelo sharp.
- Não é imagem → 400 "Não foi possível ler a imagem. Envie outro arquivo."; notícia inexistente → 404.

### Banners da home
| Método | Path | O que faz | Auth |
|---|---|---|---|
| `GET` | `/banners` | ativos dentro da janela de datas, na ordem | Pública |
| `GET` | `/admin/banners` | todos | `READ_BANNER` |
| `POST` | `/admin/banners` | `{ title, subtitle?, active?, order?, buttons?, startDate?, endDate? }` | `CREATE_BANNER` |
| `PATCH` · `DELETE` | `/admin/banners/:id` | editar · excluir | `UPDATE_BANNER` · `DELETE_BANNER` |
| `POST` | `/admin/banners/:id/image` | imagem (sharp, 1440×600 JPEG) | `UPDATE_BANNER` |
| `PATCH` | `/admin/banners/reorder` | nova ordem | `UPDATE_BANNER` |

- **Botões** (até 2): `{ label (1–40), url, external?, variant?: primary|secondary }`.
  - `url` só pode ser caminho do site (`/cursos`, `#contato`) ou `http(s)://` completo. `javascript:`, `data:`, `//outro.site` e endereço sem esquema → 400 "Link do botão: …".
- **`startDate`/`endDate`** são instantes: o painel manda o dia em Brasília (`…T00:00:00.000-03:00` / `…T23:59:59.999-03:00`). Vazio não limita.

### Galerias da home (`gallery-router.ts`)
| Método | Path | O que faz | Auth |
|---|---|---|---|
| `GET` | `/galleries` | ativas com foto | Pública |
| `GET` · `POST` | `/admin/galleries` | listar · criar `{ title, description?, linkUrl?, isActive? }` | `READ_BANNER` · `CREATE_BANNER` |
| `PATCH` | `/admin/galleries/reorder` · `/admin/galleries/:id` | ordem (conjunto completo) · editar | `UPDATE_BANNER` |
| `DELETE` | `/admin/galleries/:id` | apaga a galeria e os arquivos | `DELETE_BANNER` |
| `POST` | `/admin/galleries/:id/photos` | foto (multipart; sharp 1600 px JPEG; máx. 60 por galeria) | `UPDATE_BANNER` |
| `PATCH` | `/admin/galleries/:id/photos/reorder` · `/admin/galleries/:id/photos/:photoId` | ordem · legenda | `UPDATE_BANNER` |
| `DELETE` | `/admin/galleries/:id/photos/:photoId` | apaga a foto | `UPDATE_BANNER` |

### Cotações (`market-quote-router.ts`)
| Método | Path | O que faz | Auth |
|---|---|---|---|
| `GET` | `/market-quotes` | ativos com preço lançado | Pública |
| `GET` | `/market-quotes/history?days=` | `[{ id, label, unit, points: [{ date, period, priceCents }] }]` (7–365 dias, padrão 90) | Pública |
| `GET` | `/admin/market-quotes` | os 5 produtos fixos (SOJA, MILHO, TRIGO, MANDIOCA, DOLAR) | `READ_MARKET_QUOTE` |
| `PUT` | `/admin/market-quotes/daily` | `{ period: MORNING\|AFTERNOON, prices: [{ id, priceCents }] }` | `UPDATE_MARKET_QUOTE` |
| `PATCH` | `/admin/market-quotes/:id` | `{ unit }` de `QUOTE_UNITS` (sc 60kg, sc 50kg, sc 40kg, t, kg, @) ou null | `UPDATE_MARKET_QUOTE` |
| `PUT` | `/admin/market-quotes/source` | `{ source }` (fonte exibida; vazio esconde) | `UPDATE_MARKET_QUOTE` |

- **Lançamento do dia:** a data é hoje em America/Sao_Paulo. A variação é contra o lançamento anterior, e relançar o mesmo dia e período substitui.
- **Corrigir a manhã depois da tarde:** só muda o histórico; o preço atual continua o da tarde, com a variação recalculada.
- **Produtos:** não se cria nem exclui cotação; os produtos são fixos.
- **No painel:** a unidade trocada só vai junto do "Salvar cotações", e preço mais de 20% diferente do último pede confirmação.

### Exportação CSV (`export-router.ts`, `usecase/export-data.ts`, `adapter/database/export-adapter.ts`)
| Método | Path | O que faz | Auth |
|---|---|---|---|
| `GET` · `POST` | `/admin/export/:dataset` | CSV (`;`, BOM, tudo entre aspas, fórmula neutralizada com `'`); POST recebe os parâmetros no corpo (listas como array) | por conjunto |

| Conjunto | Permissão | Filtros |
|---|---|---|
| `people` | `READ_USER` | os da lista de pessoas |
| `companies` | `READ_USER` | search, type, isPartner |
| `properties` | `READ_USER` | ownerIds |
| `unimed` | `READ_USER` | search |
| `admins` | `READ_USER_ADMIN` | search, rulesId |
| `cadastros` | `READ_USER_ADMIN` **e** `READ_USER` (`alsoRequires`) | nenhum (pessoas, empresas, propriedades e administradores num arquivo) |
| `courses` | `READ_COURSE` | search, status |
| `registrations` | `READ_COURSE` | courseIds |
| `room-bookings` | `READ_COURSE` | from, to, roomId, type, search |
| `contact-messages` | `READ_CONTACT` | search, read |
| `audit-logs` | `READ_AUDIT` | os da auditoria; no máximo 20.000 linhas mais recentes |

- **`ids`:** exporta só esses registros; lista vazia → 400. Sem `ids`, vale o mesmo filtro da listagem.
- **Headers:** `Content-Disposition` (`pessoas-AAAA-MM-DD.csv`, ou `pessoa-<nome>-…` para um registro) e `X-Export-Count`.
- **Datas:** horário de curso e de reserva sai como gravado (`csvWallClock`); "criado em" sai no horário de Brasília (`csvDateTime`).
- **Auditoria:** cada exportação grava um `AuditLog` `method: 'EXPORT'` (entity "Exportação"). O hook geral ignora `/admin/export/*`.

### Auditoria (`audit-router.ts`, `http/audit-hooks.ts`)
| Método | Path | O que faz | Auth |
|---|---|---|---|
| `GET` | `/admin/audit-logs` | paginada; filtros `action` (create, edit, delete, export, login, login_failed), `entity`, `actorId`, `ip`, `from`, `to`, `q`; cada linha traz `summary`, `ip`, `location`, `device`, `userAgent`, `changes` | `READ_AUDIT` |
| `GET` | `/admin/audit-settings` | `{ retentionDays, options, oldestAt, total }` | `READ_AUDIT` |
| `PATCH` | `/admin/audit-settings` | `{ retentionDays }` (0 = para sempre, ou 30–3650); limpa na hora → `deleted` | `UPDATE_AUDIT` |

**O que é gravado:**
- O hook grava toda mutação com sucesso: método, caminho, `entity` (`deriveAuditEntity`) e `targetLabel` (nome do alvo).
- Fica fora (`skipAudit` em `lib/audit-entity.ts`): `/auth/refresh`, `/invites/*`, `/admin/export/*` (que grava a própria linha), `/admin/notifications/read` e `/auth/login` (que tem registro próprio).

**Login:** 2xx → `LOGIN`; 401 → `LOGIN_FAILED`; 429 → `LOGIN_BLOCKED`; `targetLabel` = usuário digitado. A senha nunca é lida.

**De onde veio:**
- `ip`, `userAgent` (até 300 caracteres) e `location` "Cidade, UF, País".
- **O IP é enviado ao ipwho.is** (`lib/geoip.ts`): timeout 2 s, cache por IP, consulta depois da resposta, nunca lança.

**O que mudou** (`changes`, `lib/audit-snapshot.ts` + `lib/audit-diff.ts`):
- Lê o registro antes e depois em PATCH/PUT/DELETE de registro identificável pelo caminho.
- Guarda só os campos alterados (até 40); na exclusão, guarda os preenchidos.
- Ficam fora: `passwordHash` (vira `password: 'alterada'`), `token`, Bytes, `*Search`, `id` e as datas de controle.
- Rota nova que edita um registro → acrescentar em `SNAPSHOTS`.

**Frase** (`summary`, `lib/audit-sentence.ts`):
- Rota especial por método + caminho (`SPECIAL`); as demais viram verbo + entidade com artigo pelo gênero.
- Entidade nova → `AUDIT_ENTITY_NOUNS` e o filtro "Tipo" do painel.

**Retenção** (`usecase/audit-retention.ts`, `adapter/database/audit-cleanup.ts`):
- O tempo de guarda fica em `SiteSetting['audit.retentionDays']`; 0 ou ausente = para sempre.
- A limpeza roda a reboque de uma gravação, no máximo uma vez por hora por processo, em lotes de 1000 (até 20.000).

### Notificações do sino (`notification-router.ts`, `usecase/notifications.ts`)
| Método | Path | O que faz | Auth |
|---|---|---|---|
| `GET` | `/admin/notifications` | `{ unreadCount, pendingCount, events: [{ id, type, title, body, link, createdAt, read }], pending: [{ type, title, body, count, link, severity }] }` | Login |
| `PATCH` | `/admin/notifications/read` | `{ ids?: string[] }` (sem `ids` = todos os visíveis; `[]` = nenhum) → `{ updated }` | Login |

**Eventos** (`Notification`, `lib/notification-events.ts`):
- Só ações públicas ou self-service: `COURSE_REGISTRATION` (`READ_COURSE`; as três inscrições públicas), `CONTACT_MESSAGE` (`READ_CONTACT`) e `INVITE_ACCEPTED` (`READ_USER_ADMIN`).
- O que a equipe faz no painel não gera evento.
- Publicar nunca derruba a ação (`publishSafely`).

**Visibilidade:**
- O admin vê só eventos cuja permissão está na regra dele, dos últimos 30 dias, até 50.
- A leitura é por admin (`NotificationRead`).
- Eventos com mais de 90 dias são apagados (no máximo uma vez por hora).

**Pendências:** calculadas na hora (`usecase/pending-notifications.ts`), nada gravado. Ex.: `ROOM_BOOKINGS_TODAY` (`READ_COURSE`), com link para o Painel Geral no dia.

### Painel Geral (`dashboard-router.ts`)
| Método | Path | O que faz | Auth |
|---|---|---|---|
| `GET` | `/admin/dashboard/stats` | números do painel, só os blocos que a regra deixa ver (o resto é **omitido**, não 403) | Login |

```
READ_COURSE       courses: { total, public, private, unpublished, inProgress, completed }, totalRooms,
                  registrations: { last30Days, pendingConfirmation }, coursesStartingIn7Days,
                  totalRegistrations, registrationsLast30Days (nomes antigos, mantidos)
READ_USER         totalUsers (pessoas ativas, não só associados), membershipsExpiring30Days
READ_USER_ADMIN   totalAdmins
READ_CONTACT      unreadMessages
READ_MARKET_QUOTE quotesToday: { launched, period: MORNING | AFTERNOON | null }
```

- "Hoje" é o dia em Brasília (`brasiliaToday`).
- `pendingConfirmation` = inscrições ativas sem confirmar em cursos que não terminaram.
- `membershipsExpiring30Days` usa a mesma consulta do sino.
- O calendário do painel é `GET /admin/room-schedule`.

### Financeiro (`finance-router.ts`, `http/controllers/finance-controller.ts`)
Valores sempre em **centavos** (`Int` > 0). Lançamento sem `type` = "só nota": fica fora de saldo, totais e gráficos.

| Método | Path | O que faz | Auth |
|---|---|---|---|
| `GET` | `/admin/finance/categories[?all=true]` | categorias (sem `all`, só as ativas) | `READ_FINANCE` |
| `POST` · `PATCH` · `DELETE` | `/admin/finance/categories[/:id]` | `{ name, type: IN\|OUT, color?, active?, order? }` → 201 · `{ message }` · 204 (soft) | `CREATE_` · `UPDATE_` · `DELETE_FINANCE` |
| `GET` · `POST` · `PATCH` · `DELETE` | `/admin/finance/accounts[/:id]` | caixas `{ name, color?, active?, order? }` (mesmo padrão) | `READ_` · `CREATE_` · `UPDATE_` · `DELETE_FINANCE` |
| `GET` | `/admin/finance/transactions` | paginada; filtros abaixo; traz `totals` | `READ_FINANCE` |
| `POST` | `/admin/finance/transactions` | criar lançamento → 201 (a linha) | `CREATE_FINANCE` |
| `PATCH` · `DELETE` | `/admin/finance/transactions/:id` | editar → `{ message }` · excluir (soft) → 204 | `UPDATE_` · `DELETE_FINANCE` |
| `GET` | `/admin/finance/transactions/export` | CSV dos lançamentos filtrados | `READ_FINANCE` |
| `POST` | `/admin/finance/transfers` | transferência entre caixas → 201 `{ message }` | `CREATE_FINANCE` |
| `POST` | `/admin/finance/transactions/:id/attachments` | comprovante (multipart: PDF, JPG, PNG, WEBP até 15 MB) → 201 `{ id, filename, mimeType, size, createdAt }` | `UPDATE_FINANCE` |
| `GET` · `DELETE` | `/admin/finance/attachments/:attachmentId` | baixar (inline) · apagar de verdade | `READ_FINANCE` · `UPDATE_FINANCE` |
| `GET` | `/admin/finance/summary?from&to` | resumo (abaixo) | `READ_FINANCE` |
| `GET` · `POST` · `PATCH` · `DELETE` | `/admin/finance/recurrences[/:id]` | molde do lançamento mensal | `READ_` · `CREATE_` · `UPDATE_` · `DELETE_FINANCE` |
| `POST` | `/admin/finance/recurrences/generate` | gera o que falta até o mês atual → `{ created }` | `CREATE_FINANCE` |
| `GET` · `POST` · `PATCH` · `DELETE` | `/admin/finance/payment-methods[/:id]` | formas de pagamento | `READ_` · `CREATE_` · `UPDATE_` · `DELETE_FINANCE` |
| `GET` | `/admin/finance/closings` · `/admin/finance/closings/preview?accountId&month` | fechamentos · prévia do mês | `READ_FINANCE` |
| `POST` · `DELETE` | `/admin/finance/closings[/:id]` | fechar o mês · reabrir | `CREATE_` · `DELETE_FINANCE` |

**Lançamento:** `{ type?: IN|OUT|null, amountCents, date, description, method?, notes?, categoryId?, accountId?, empenho? }`.
- `empenho` é a Nota de Empenho, JSON ou null: `numero, notaFiscal, nomeFantasia, razaoSocial, cnpjCpf, inscricaoEstadual, endereco, bairro, cep, cidade, uf, telefone, banco, conta, agencia, cheque, descontoCents, usuarioId, empresaId`.
- Recusas → 400:
  - categoria sem tipo no lançamento;
  - categoria de outro tipo, inexistente ou excluída ("Categoria inválida");
  - caixa inexistente ou excluído ("Caixa inválido").
- Perna de transferência não se edita → 400 "Transferências não podem ser editadas — exclua e refaça."; excluir uma perna apaga as duas.
- `method` é texto livre; `payment-methods` é só a lista que o painel oferece.

**Transferência:** `{ fromAccountId, toAccountId, amountCents, date, description?, method? }`.
- Origem igual ao destino → 400.
- Cria OUT e IN com o mesmo `transferId`, numa transação.
- Fica fora de receita e despesa, mas conta no saldo de cada caixa.

**Listagem:**
- Filtros `from`, `to` (inclui o dia inteiro), `type`, `categoryId`, `accountId`, `method` (sem diferenciar maiúsculas), `search` (descrição).
- Ordem por data desc.
- `totals: { incomeCents, expenseCents }` somam todos os filtrados, sem transferências nem "só nota".
- Filtro com formato inválido → 400 "Parâmetro inválido: <campo>" (vale também para resumo, exportação e fechamentos).

**Resumo** → `{ balanceAllTimeCents, periodInCents, periodOutCents, periodResultCents, byCategory, byMonth, byAccount }`.
- Sem `from`, são os últimos 12 meses.
- "Só nota" fica fora também do saldo por caixa (`byAccount`), então a soma das caixas fecha com `balanceAllTimeCents`.
- Excluir categoria ou caixa é soft e não é barrado por lançamentos. O saldo de caixa excluído cai em "Sem caixa".

**Recorrência** (`FinanceRecurringTransaction`):
- Meses são `"AAAA-MM"` (`startMonth`, `endMonth?`, `lastGeneratedMonth?`). `dayOfMonth` vai de 1 a 31; no mês mais curto, vale o último dia.
- A geração roda quando a tela abre e é idempotente (unique `(recurringId, recurringMonth)`), com teto de 120 meses por rodada.
- Excluir é soft-delete do molde.

**Formas de pagamento:** nome em caixa alta e único.

**Fechamento** (`FinanceMonthlyClosing`, único por caixa e mês):
- Esperado = abertura + entradas − saídas, recalculado no servidor; `differenceCents` = contado − esperado.
- `DELETE` reabre sem tocar nos lançamentos.
- Hoje o mês fechado **não** trava lançamentos (SR-020, aguardando decisão).

## Modelos

Nomes como estão no `prisma/schema.prisma` (alguns em minúsculas). Detalhe de cada coluna: o schema.

| Modelo | Campos principais |
|---|---|
| `UserData` | pessoa: id, name, email?, phone, phone2/phone3, cpf? (só dígitos; único entre ativos), rg, rgIssuer, rgIssuedAt, birthDate, nickname, avatar, maritalStatus, gender, ethnicity, educationLevel, birthPlace, nationality, driverLicense(+Category), functionalCategory, specialNeeds, memberClassification, memberType, cadPro[] (até 5), familyIncome, boardPosition, boardMember, memberStatus, memberSince, membershipValidUntil, memberNotes, memberNotesNumber, primaryPropertyId (sem FK), nameSearch, isDeleted |
| `UserAdmin` | id, username (único entre ativos), passwordHash, userDataId (único, inclusive entre os excluídos), rulesId (FK), dashboardPrefs (Json?), isDeleted |
| `Rule` | id, name, description, permissions (Permission[]) |
| `AdminInvite` | id, token (único), userDataId e rulesId (sem FK), expiresAt, usedAt (null = pendente) |
| `UserInstructor` | id, userDataId (único), bio, linkedin, instagram, facebook, isDeleted |
| `UserRelation` | id, sourceId, targetId (FK→UserData), label |
| `Property` | id, userDataId? **ou** companyId? (CHECK de um dono só), name, registration, addressId |
| `Address` | id, type (URBAN/RURAL), city, state, zipCode, street, number, neighborhood, complement, notes, localityName, road, km, lot, section |
| `Company` | id, name, tradeName, cnpj (único entre ativas), stateRegistration, type, phone(2/3), email, website, notes, addressId (sede), isPartner, partnerUrl, partnerLogo, partnerOrder, primaryPropertyId, nameSearch/tradeNameSearch, isDeleted |
| `CompanyMember` | id, companyId, userDataId, title — único por (empresa, pessoa) |
| `PublicContact` | id, userDataId (único, cascade), title, order |
| `UnimedBeneficiario` | id, userDataId (único), dataAdesao, tipoMovimento, tipoDependente, grauDependencia, cns, nomeMae, profissao, plano, matricula, empresa, contratante, titularId (UserData.id, sem FK), motivo, obs, createdBy, isDeleted |
| `Convenio` | id, slug (único), name, title, subtitle, intro, logoUrl, priceLabelHeader, priceValueHeader, priceRows (Json), priceNote, documentsTitle, documents (Json), highlightsTitle, highlights (Json), aboutTitle, aboutText, isActive, order — sem soft-delete |
| `course` | id, name, nameSearch, description, roomId (FK), startTime, endTime, status, price (Float), workloadHours, bannerUrl, bannerThumbUrl, eventNumber, minStudents, preEnrolled, waitlist, registrationDeadline, observations, isDeleted |
| `CourseInstructor` | id, courseId, instructorId (FK→UserInstructor), title, category, isDeleted — único por (instrutor, curso) |
| `CoursePhoto` | id, courseId, url, caption, isDeleted |
| `courseUserRegistration` | id, courseId, userDataId, confirmed, attended (null/true/false), isDeleted — única ativa por (curso, pessoa) |
| `registrationFicha` | id, registrationId (único, cascade), data (Bytes), filename, mimeType |
| `room` | id, name (único entre ativas), description, maxCapacity, addressId, isDeleted |
| `RoomBooking` | id, type (EVENT/MEETING), title, titleSearch, description, publicOnSite, publicDescription, roomId (cascade), startTime, endTime (CHECK fim > início), responsibleUserDataId (SetNull), responsibleName, seriesId, isDeleted |
| `News` | id, title, content, summary, bannerUrl, status, publishedAt, publishAt, isDeleted |
| `Banner` | id, title, subtitle, imageUrl, active, order, buttons (Json), startDate, endDate, isDeleted |
| `GalleryAlbum` / `GalleryPhoto` | álbum: id, title, description, linkUrl, isActive, order · foto: id, albumId (cascade), url, storageKey, caption, order |
| `ContactMessage` | id, name, email, phone, subject, message, read, isDeleted |
| `SiteSetting` | key, value |
| `MarketQuote` | id, label (único), value (texto pronto), priceCents, unit, period, variation, referenceDate, isActive, order |
| `MarketQuoteHistory` | id, marketQuoteId, value, numeric, referenceDate, period — único por produto, dia e período |
| `AuditLog` | id, actorId (sem FK), method (POST/PATCH/PUT/DELETE/EXPORT/LOGIN/LOGIN_FAILED/LOGIN_BLOCKED), path, entity, targetLabel, statusCode, ip, userAgent, location, changes (Json), createdAt |
| `Notification` / `NotificationRead` | evento: id, type, title, body, link, permission, entityId · leitura: notificationId (cascade), adminId, readAt — única por (evento, admin) |
| `FinancialCategory` | id, name, type, color, active, order, isDeleted |
| `FinancialAccount` | id, name, color, active, order, isDeleted |
| `FinancialTransaction` | id, type? (null = só nota), amountCents, date, description, method, notes, categoryId?, accountId?, transferId, createdBy, recurringId (SetNull), recurringMonth, empenho (Json?), isDeleted — único por (recurringId, recurringMonth) |
| `FinancialAttachment` | id, transactionId (cascade), data (Bytes), filename, mimeType, size |
| `FinanceRecurringTransaction` | id, type, description, amountCents, dayOfMonth, startMonth, endMonth, lastGeneratedMonth, paymentMethod, notes, active, categoryId?, accountId?, isDeleted |
| `FinancePaymentMethod` | id, name (único), active, order, isDeleted |
| `FinanceMonthlyClosing` | id, accountId (cascade), month, expectedBalanceCents, countedBalanceCents, differenceCents, notes, closedAt, closedByAdminId — único por (caixa, mês) |

## Enums

| Enum | Valores |
|---|---|
| `CourseStatus` | `PUBLIC`, `PRIVATE`, `UNPUBLISHED`, `IN_PROGRESS`, `COMPLETED` |
| `NewsStatus` | `PUBLISHED`, `UNPUBLISHED` |
| `BookingType` | `EVENT`, `MEETING` |
| `QuotePeriod` | `MORNING`, `AFTERNOON` |
| `FinancialType` | `IN`, `OUT` |
| `CompanyType` | `PRIVATE`, `PUBLIC` |
| `MaritalStatus` | `SINGLE`, `MARRIED`, `DIVORCED`, `WIDOWED`, `DOMESTIC_PARTNERSHIP` |
| `Gender` | `MALE`, `FEMALE`, `OTHER` |
| `Ethnicity` | `WHITE`, `BLACK`, `MIXED`, `ASIAN`, `INDIGENOUS` |
| `EducationLevel` | `NO_FORMAL_EDUCATION`, `INCOMPLETE_PRIMARY`, `COMPLETE_PRIMARY`, `INCOMPLETE_SECONDARY`, `COMPLETE_SECONDARY`, `INCOMPLETE_HIGHER`, `COMPLETE_HIGHER`, `POSTGRADUATE` |
| `MemberStatus` | `ACTIVE`, `INACTIVE` |
| `AddressType` | `URBAN`, `RURAL` |
| `Permission` | os 40 de "Autenticação e permissões" |

## Adapters (`src/adapter/database/`)

Todos recebem o `PrismaClient` e implementam o port de mesmo nome em `src/ports/external/`:
- `createAddressAdapter`, `createAdminInviteAdapter`, `createBannerAdapter`, `createCompanyAdapter`, `createContactMessageAdapter`, `createConvenioAdapter`;
- `createCourseAdapter`, `createDashboardAdapter`, `createExportAdapter`, `createFinanceAdapter`, `createGalleryAdapter`, `createInstructorAdapter`;
- `createMarketQuoteAdapter`, `createNewsAdapter`, `createNotificationAdapter` e `createNotificationPublisher` (os dois em `notification-adapter.ts`), `createPendingNotificationsAdapter`;
- `createPropertyAdapter`, `createPublicContactAdapter`, `createRegistrationAdapter`, `createRoomAdapter`, `createRoomBookingAdapter`, `createRuleAdapter`;
- `createSiteSettingsAdapter`, `createUnimedAdapter`, `createUserAdminAdapter`, `createUserDataAdapter` (`user-data.ts`), `createUserMergeAdapter` e `createUserRelationAdapter`.

Storage: `createStorageAdapter()` (`adapter/storage/factory.ts`) devolve o `SupabaseStorageAdapter`, que lê `SUPABASE_URL` e `SUPABASE_SECRET_KEY`.

Helpers que não são adapters:
- `list-filters.ts`: `build*Where` e `searchKey`, compartilhados com as exportações;
- `prisma-errors.ts`: `semRegistro`;
- `audit-cleanup.ts`.

## Rota nova: o caminho

1. **Port** em `ports/external/foo-repository.ts` e **adapter** em `adapter/database/foo-adapter.ts` (`createFooAdapter(prisma)`, `semRegistro` no `catch`).
2. **Use case** em `usecase/`: valida com Zod (`safeParse`, nunca `parse`) e devolve `{ error?, ...resultado }`.
3. **Controller** em `http/controllers/`: checa a permissão primeiro (`requirePermission`/`requireAuth`) e responde com `errorToStatus`.
4. **Router** em `http/router/`: schema Swagger com `tags`, `summary`, `description`, `body`/`params`/`querystring`, `response` e `security: [{ bearerAuth: [] }]` quando protegida. Registrado em `http/register-routers.ts`, o que já vale para o servidor e para os E2E.
5. **Auditoria:** rota que edita um registro → `SNAPSHOTS` (`lib/audit-snapshot.ts`); ação diferente de criar/editar/excluir → `SPECIAL` (`lib/audit-sentence.ts`); entidade nova → `AUDIT_ENTITY_NOUNS`.
6. **Permissão nova** → enum no schema + migration que a concede (ver Autenticação).
7. **Testes:** unitário do use case e, para rota protegida, E2E com 401 sem token e 403 sem a permissão.
8. **Este arquivo:** a linha da rota no mesmo commit.

**Upload:** `const data = await request.file(); const buffer = await data.toBuffer();`. O multipart tem limite de 15 MB (`index.ts`); acima disso → 413/400 "Arquivo excede o limite permitido.". Imagem pública nova: `validateImageUpload` + `toJpeg` (`lib/image-upload.ts`).

## Swagger

- `http://localhost:3000/docs`. Fora de produção sempre sobe; em produção, só com `ENABLE_DOCS=true`.
- Rotas protegidas: login em `POST /auth/login`, depois **Authorize** com o token.

## Comandos, testes e CI

```bash
npm run dev                # tsx watch
npm run build              # tsc (tsconfig.build.json)
npm run start              # node dist/index.js
npm run lint               # eslint src/
npx tsc --noEmit           # tipos
npm run test:run           # unitários
npm run test:e2e           # E2E (banco local, ver abaixo)
npm run prisma:migrate     # criar/aplicar migration (dev)
npm run prisma:generate    # regenerar o client
```

**E2E:**
- Rodam num Postgres **local** e descartável: o setup recusa host que não seja localhost.
- Aplicam as migrations com `migrate deploy` e limpam as tabelas entre os arquivos.
- O banco vem do `DATABASE_TEST_URL` do comando; sem ele, do `.env.test`. Testes e migrations vão para o mesmo banco, então cada chat pode usar o seu.
- O app dos E2E não registra o rate limit; para testar limites, use `createTestApp(prisma, { rateLimit: true })`.

**CI** (`.github/workflows/ci.yml`, em `main` e `staging`):
- Roda lint, tsc, unitários, "Schema × migrations" e E2E, com Postgres 16.
- "Schema × migrations" faz `migrate deploy` num banco vazio e depois `prisma migrate diff --exit-code` contra o `schema.prisma`. Qualquer diferença deixa o CI vermelho, inclusive um DEFAULT que só exista no banco.
- Mexeu no `schema.prisma`? A migration tem de levar o banco exatamente a ele.

**Deploy:** o `Dockerfile` roda `npx prisma migrate deploy` ao subir, antes do servidor. Migration que falha em produção derruba o deploy; dado ruim antigo precisa ser tratado na própria migration.
