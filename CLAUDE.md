# CLAUDE.md — back-sindicato-rural-tr

Backend de um **Sindicato Rural** para gerenciar fichas completas de associados (trabalhadores rurais), administradores, regras de permissão, cursos e notícias.

## Stack

- **Runtime**: Node.js + TypeScript (ESM — `"type": "module"`)
- **Framework HTTP**: Fastify v5 + `@fastify/multipart` (upload de arquivos)
- **ORM**: Prisma 7 com driver `@prisma/adapter-pg` (PostgreSQL nativo)
- **Auth**: JWT (`jsonwebtoken`) + bcrypt para hash de senhas
- **Storage**: Supabase Storage (`@supabase/supabase-js`)
- **Validação de env**: Zod — falha na inicialização se variáveis estiverem faltando
- **Dev**: `tsx watch` para hot reload

## Variáveis de ambiente (.env)

```
DATABASE_URL=
JWT_SECRET=               # mínimo 32 caracteres
PORT=3000
NODE_ENV=development
CORS_ORIGIN=*
SUPABASE_URL=                # https://<ref>.supabase.co
SUPABASE_SECRET_KEY=         # sb_secret_... (server-side, acesso total)
STORAGE_BUCKET=avatars
BANNER_BUCKET=course-banners
NEWS_BANNER_BUCKET=news-banners
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
    conflict.ts               — ConflictError (base) + 7 erros específicos de conflito
    not-found.ts              — NotFoundError (base) + 17 erros específicos de not found
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
    storage/                  — adapter do Supabase Storage (via factory)
  generated/prisma/           — tipos gerados pelo Prisma (não editar)
```

## Modelos de dados

| Modelo                   | Campos principais                                                                                          |
|--------------------------|------------------------------------------------------------------------------------------------------------|
| `UserData`               | id, name, email, phone, cpf (só dígitos; vazio = null — `UserDataAdapter` normaliza em create/update), nameSearch (busca, preenchida por trigger), avatar, nickname, maritalStatus, phone2, phone3, rg, rgIssuer, rgIssuedAt, birthDate, driverLicense, driverLicenseCategory, birthPlace, nationality, gender, ethnicity, educationLevel, functionalCategory, specialNeeds, memberClassification, cadPro (até 5), familyIncome, memberType (lista fixa em `lib/member-types.ts`: ALUNO, PRODUTOR RURAL, TRABALHADOR RURAL ASSALARIADO, TRABALHADOR RURAL AUTONOMO; fora da lista → 400), boardPosition, boardMember, memberStatus, memberSince, memberNotes, memberNotesNumber, addressId (FK). Colunas cnpj/isPartner/partner* foram removidas (migration `20260917140000`): CNPJ antigo e tipo de membro fora da lista (ex.: SOCIO) foram copiados para `memberNotes` — empresa/parceria é `Company` |
| `Company`                | id, name (razão social), tradeName (nome fantasia), nameSearch/tradeNameSearch (busca, preenchidas por trigger), addressId (FK→Address, sede; SetNull), cnpj (só dígitos; único entre ativas, índice parcial), stateRegistration, type (PRIVATE/PUBLIC), phone, phone2, phone3, email, website, notes, isPartner, partnerUrl, partnerLogo, partnerOrder, primaryPropertyId, isDeleted (soft delete) |
| `CompanyMember`          | id, companyId (FK), userDataId (FK), title (texto livre em maiúsculas) — único por (companyId, userDataId) |
| `UserAdmin`              | id, username, passwordHash, userDataId (FK), rulesId (FK)                                                  |
| `PublicContact`          | id, userDataId (FK único, cascade), title (cargo exibido), order — contatos da página Contato; qualquer pessoa, com ou sem login |
| `SiteSetting`            | key, value — chaves `social.*`, `org.*` (telefone, e-mail, endereço, horário, busca do mapa), `about.text`, `quotes.source` |
| `UserInstructor`         | id, userDataId (FK único), bio, linkedin, instagram, facebook                                              |
| `Rule`                   | id, name, description, permissions (Permission[])                                                          |
| `Course`                 | id, name, description, roomId (FK), startTime, endTime, status, price, workloadHours, coverImage (coluna `bannerUrl`, JPEG 1920×1080), coverImageThumb (coluna `bannerThumbUrl`, WebP 640×360 para os cards; migration `20260919110000`; null em cursos antigos → front usa a capa), eventNumber, minStudents, preEnrolled, waitlist, registrationDeadline, observations |
| `CourseInstructor`       | id, courseId (FK), instructorId (FK→UserInstructor), title, category                                      |
| `Room`                   | id, name (lista fixa em `lib/room-names.ts`: AUDITORIO, COZINHA, SALA DE VIDEO CONFERENCIA, SALA 1, SALA 2, SALA APL; único), description, maxCapacity, addressId (FK) |
| `News`                   | id, title, content, summary, bannerUrl, status, publishedAt                                                |
| `CoursePhoto`            | id, courseId (FK), url, caption                                                                            |
| `CourseUserRegistration` | id, courseId (FK), userDataId (FK)                                                                         |
| `Address`                | id, type (URBAN/RURAL), city, state, zipCode, complement, notes, street, number, neighborhood, localityName, road, km, lot, section |
| `Property`               | id, userDataId (FK?), companyId (FK?), name, registration, addressId (FK) — CHECK `Property_single_owner`: exatamente um dono (pessoa OU empresa) |
| `UserRelation`           | id, sourceId (FK→UserData), targetId (FK→UserData), label (texto livre)                                    |
| `Banner`                 | id, title, subtitle, imageUrl, active, order, buttons (JSON), startDate, endDate                           |
| `ContactMessage`         | id, name, email, phone, subject, message, read, createdAt                                                  |
| `MarketQuote`            | id, label (único; produtos fixos SOJA, MILHO, TRIGO, MANDIOCA, DOLAR criados na migration), value (texto pronto), priceCents, unit (configurável no painel), period (MORNING/AFTERNOON), variation, referenceDate (dia do lançamento), isActive, order |
| `MarketQuoteHistory`     | id, marketQuoteId (FK), value, numeric, referenceDate, period — único por produto/dia/período (`@@unique`; relançar substitui) |
| `GalleryAlbum`           | id, title, description, linkUrl, isActive, order — galerias da home (História do Sindicato, FAEP, Patrulha Rural) |
| `GalleryPhoto`           | id, albumId (FK, cascade), url, storageKey, caption, order |

## Enums

| Enum | Valores |
|------|---------|
| `CourseStatus` | `PUBLIC`, `PRIVATE`, `UNPUBLISHED` |
| `NewsStatus` | `PUBLISHED`, `UNPUBLISHED` |
| `Permission` | `CREATE_USER`, `UPDATE_USER`, `DELETE_USER`, `READ_USER`, `CREATE_COURSE`, `UPDATE_COURSE`, `DELETE_COURSE`, `READ_COURSE`, `CREATE_RULE`, `UPDATE_RULE`, `DELETE_RULE`, `READ_RULE`, `CREATE_USER_ADMIN`, `UPDATE_USER_ADMIN`, `DELETE_USER_ADMIN`, `READ_USER_ADMIN`, `CREATE_NEWS`, `UPDATE_NEWS`, `DELETE_NEWS`, `READ_NEWS`, `READ_CONTACT`, `UPDATE_CONTACT`, `CREATE_BANNER`, `UPDATE_BANNER`, `DELETE_BANNER`, `READ_BANNER` |
| `MaritalStatus` | `SINGLE`, `MARRIED`, `DIVORCED`, `WIDOWED`, `DOMESTIC_PARTNERSHIP` |
| `Gender` | `MALE`, `FEMALE`, `OTHER` |
| `Ethnicity` | `WHITE`, `BLACK`, `MIXED`, `ASIAN`, `INDIGENOUS` |
| `EducationLevel` | `NO_FORMAL_EDUCATION`, `INCOMPLETE_PRIMARY`, `COMPLETE_PRIMARY`, `INCOMPLETE_SECONDARY`, `COMPLETE_SECONDARY`, `INCOMPLETE_HIGHER`, `COMPLETE_HIGHER`, `POSTGRADUATE` |
| `MemberStatus` | `ACTIVE`, `INACTIVE` |
| `AddressType` | `URBAN`, `RURAL` |

## Permissões disponíveis (em `Rule.permissions`)

```
CREATE_USER    UPDATE_USER    DELETE_USER    READ_USER
CREATE_COURSE  UPDATE_COURSE  DELETE_COURSE  READ_COURSE
CREATE_RULE    UPDATE_RULE    DELETE_RULE    READ_RULE
CREATE_USER_ADMIN  UPDATE_USER_ADMIN  DELETE_USER_ADMIN  READ_USER_ADMIN
CREATE_NEWS    UPDATE_NEWS    DELETE_NEWS    READ_NEWS
READ_CONTACT   UPDATE_CONTACT
CREATE_BANNER  UPDATE_BANNER  DELETE_BANNER  READ_BANNER
```

## Rotas HTTP

### Auth
| Método | Path | Use Case | Autenticação |
|--------|------|----------|--------------|
| `POST` | `/auth/login` | `LoginUserAdminUseCase` | Pública |
| `POST` | `/auth/refresh` | `RefreshAdminTokenUseCase` (token atual válido + admin ainda existe → token novo, mesmo payload) | JWT (qualquer admin) |

### Usuários (UserData)
| Método | Path | Use Case | Autenticação |
|--------|------|----------|--------------|
| `POST` | `/users` | `CreateUserUseCase` | Pública |
| `GET` | `/admin/users` | `ListUsersUseCase` | `READ_USER` |
| `GET` | `/admin/users/:id` | `GetUserDetailUseCase` | `READ_USER` |
| `PATCH` | `/users/:id` | `UpdateUserDataUseCase` | `UPDATE_USER` |
| `DELETE` | `/users/:id` | `DeleteUserDataUseCase` | `DELETE_USER` |
| `PUT` | `/admin/users/:id/address` | `UpsertUserAddressUseCase` | `UPDATE_USER` |
| `GET` | `/admin/users/:id/relations` | `ListUserRelationsUseCase` | `READ_USER` |
| `POST` | `/admin/users/:id/relations` | `AddUserRelationUseCase` | `UPDATE_USER` |
| `DELETE` | `/admin/users/:id/relations/:relationId` | `DeleteUserRelationUseCase` | `UPDATE_USER` |
| `GET` | `/admin/users/:id/properties` | `ListUserPropertiesUseCase` | `READ_USER` |
| `POST` | `/admin/users/:id/properties` | `AddPropertyUseCase` | `UPDATE_USER` |
| `DELETE` | `/admin/users/:id/properties/:propertyId` | `DeletePropertyUseCase` | `UPDATE_USER` |
| `POST` | `/admin/users/:id/avatar` | `UploadAvatarUseCase` | `UPDATE_USER` |

### Empresas e parceiros (`company-router.ts`, use cases em `usecase/company-usecases.ts`)
| Método | Path | Use Case | Autenticação |
|--------|------|----------|--------------|
| `GET` | `/admin/companies` | `ListCompaniesUseCase` (search, type, isPartner) | `READ_USER` |
| `GET` | `/admin/companies/titles` | `ListMemberTitlesUseCase` | `READ_USER` |
| `GET` | `/admin/companies/:id` | `GetCompanyUseCase` (members + properties) | `READ_USER` |
| `POST` | `/admin/companies` | `CreateCompanyUseCase` (aceita `tradeName` e `address` da sede) | `CREATE_USER` |
| `PATCH` | `/admin/companies/:id` | `UpdateCompanyUseCase` (dados, parceria, primaryPropertyId; `address` null/vazio remove) | `UPDATE_USER` |
| `DELETE` | `/admin/companies/:id` | `DeleteCompanyUseCase` (soft) | `DELETE_USER` |
| `POST` | `/admin/companies/:id/members` | `AddCompanyMemberUseCase` | `UPDATE_USER` |
| `PATCH` | `/admin/companies/:id/members/:memberId` | `UpdateCompanyMemberUseCase` | `UPDATE_USER` |
| `DELETE` | `/admin/companies/:id/members/:memberId` | `RemoveCompanyMemberUseCase` | `UPDATE_USER` |
| `POST` | `/admin/companies/:id/properties` | `AddCompanyPropertyUseCase` | `UPDATE_USER` |
| `DELETE` | `/admin/companies/:id/properties/:propertyId` | `RemoveCompanyPropertyUseCase` | `UPDATE_USER` |
| `POST` | `/admin/companies/:id/partner-logo` | `UploadCompanyPartnerLogoUseCase` | `UPDATE_USER` |
| `GET` | `/partners` | `ListPartnersUseCase` (empresas parceiras ativas) | Pública |
| `PATCH` | `/admin/partners/reorder` | `ReorderPartnersUseCase` (`{ order: companyId[] }`) | `UPDATE_USER` |

### Administradores (UserAdmin)
| Método | Path | Use Case | Autenticação |
|--------|------|----------|--------------|
| `GET` | `/admin/me` | `GetCurrentAdminUseCase` | JWT (qualquer admin) |
| `GET` | `/admin/users/admins` | `ListUserAdminsUseCase` | `READ_USER_ADMIN` |
| `POST` | `/admin/users` | `CreateUserAdminUseCase` | `CREATE_USER_ADMIN` |
| `PATCH` | `/admin/users/:id` | `UpdateUserAdminUseCase` | `UPDATE_USER_ADMIN` |
| `DELETE` | `/admin/users/:id` | `DeleteUserAdminUseCase` | `DELETE_USER_ADMIN` |

> `GET /admin/me` retorna `{ userId, userDataId, username, rulesId, ruleName, permissions[] }`.
> `userId` = UserAdmin.id (igual ao JWT). `userDataId` = UserData.id vinculado.

### Contatos públicos (`public-contact-router.ts`, use cases em `usecase/public-contact-usecases.ts`)
| Método | Path | Use Case | Autenticação |
|--------|------|----------|--------------|
| `GET` | `/contacts` | `ListPublicContactsUseCase.listPublic` (`{ publicTitle, userData: { name, email, phone, avatar } }`, na ordem) | Pública |
| `GET` | `/admin/public-contacts` | `ListPublicContactsUseCase` | `READ_USER` |
| `POST` | `/admin/public-contacts` | `AddPublicContactUseCase` — `{ userDataId, title }`; entra no fim; pessoa inexistente → 404, repetida → 409 | `UPDATE_USER` |
| `PATCH` | `/admin/public-contacts/reorder` | `ReorderPublicContactsUseCase` — `{ order: id[] }` com todos os ids | `UPDATE_USER` |
| `PATCH` · `DELETE` | `/admin/public-contacts/:id` | `UpdatePublicContactUseCase` (cargo) · `RemovePublicContactUseCase` | `UPDATE_USER` |

### Configurações do site (`site-settings-router.ts`)
| Método | Path | Use Case | Autenticação |
|--------|------|----------|--------------|
| `GET` | `/site-settings` | `GetSiteSettingsUseCase` (todas as chaves; ausente = '') | Pública |
| `GET` · `PATCH` | `/admin/site-settings` | `GetSiteSettingsUseCase` · `UpdateSiteSettingsUseCase` (só grava o que veio; valida URLs, e-mail, UF) | `READ_BANNER` · `UPDATE_BANNER` |

### Exportação CSV (`export-router.ts`, `usecase/export-data.ts`, `adapter/database/export-adapter.ts`)
| Método | Path | Use Case | Autenticação |
|--------|------|----------|--------------|
| `GET` · `POST` | `/admin/export/:dataset` | `ExportDataUseCase` — CSV (`;`, BOM, tudo entre aspas, fórmula neutralizada com `'`). POST recebe os parâmetros no corpo JSON (listas como array; é o que o painel usa, seleção grande não cabe na URL) | por conjunto (abaixo) |

- Conjuntos: `people`, `companies`, `properties`, `unimed` (READ_USER), `admins` (READ_USER_ADMIN), `courses`, `registrations` (READ_COURSE), `contact-messages` (READ_CONTACT), `audit-logs` (READ_AUDIT).
- `ids` exporta só esses (seleção ou um registro; lista vazia → 400); sem `ids`, os mesmos filtros da listagem (`adapter/database/list-filters.ts`, compartilhado com os adapters das listas). `properties` aceita `ownerIds`; `registrations` aceita `courseIds`.
- Headers: `Content-Disposition` (`pessoas-AAAA-MM-DD.csv`, ou `pessoa-<nome>-AAAA-MM-DD.csv` para um registro) e `X-Export-Count`.
- Filtros validados como na listagem (enums de sexo/etnia/escolaridade; datas `AAAA-MM-DD`, dia em Brasília). `audit-logs` sai com no máximo 20.000 linhas mais recentes.
- Horários de curso saem como gravados (`csvWallClock`: o painel grava o relógio local com Z); momentos como "criado em" saem no horário de Brasília (`csvDateTime`).
- Cada exportação grava um AuditLog com `method: 'EXPORT'` e entity "Exportação" (filtro `action=export` na auditoria); o hook de auditoria ignora `/admin/export/*` para não duplicar.

### Instrutores
| Método | Path | Use Case | Autenticação |
|--------|------|----------|--------------|
| `POST` | `/admin/users/:id/instructor` | `PromoteToInstructorUseCase` | `UPDATE_USER` |
| `PATCH` | `/admin/users/:id/instructor` | `UpdateInstructorUseCase` | `UPDATE_USER` |
| `DELETE` | `/admin/users/:id/instructor` | `DemoteInstructorUseCase` | `UPDATE_USER` |
| `GET` | `/admin/instructors` | `ListInstructorsUseCase` | `READ_USER` |
| `POST` | `/admin/courses/:courseId/instructors` | `AddInstructorToCourseUseCase` | `UPDATE_COURSE` |
| `DELETE` | `/admin/courses/:courseId/instructors/:assignmentId` | `RemoveInstructorFromCourseUseCase` | `UPDATE_COURSE` |

### Cursos
| Método | Path | Use Case | Autenticação |
|--------|------|----------|--------------|
| `GET` | `/courses` | `ListCoursesUseCase` | Pública |
| `GET` | `/courses/:courseId` | `GetCourseDetailUseCase` | Pública |
| `POST` | `/courses` | `CreateCourseUseCase` (aceita `eventNumber`, `minStudents`) + `CopyCourseExtrasUseCase` ao duplicar: `copyCoverFromCourseId` baixa a capa e envia de novo pelo upload de capa (arquivo próprio — a capa fica em `courses/<id>/banner.jpg` e trocar a de um curso mudaria a do outro), `copyInstructorsFromCourseId` + `instructorAssignmentIds` copiam instrutores; resposta `{ id, coverCopied?, instructorsCopied? }`; falha na cópia não desfaz o curso (responde 201 dizendo o que não veio); a capa só é baixada do próprio storage (`lib/download-image.ts`: origem do `SUPABASE_URL`, sem redirecionamento); galeria não é copiada | `CREATE_COURSE` (+ `UPDATE_COURSE` para copiar capa/instrutores) |
| `PATCH` | `/courses/:courseId` | `UpdateCourseUseCase` | `UPDATE_COURSE` |
| `DELETE` | `/courses/:courseId` | `DeleteCourseUseCase` | `DELETE_COURSE` |
| `POST` | `/courses/:courseId/banner` | `UploadCourseBannerUseCase` (capa `courses/:id/banner.jpg` + miniatura `banner-thumb.webp`, gravadas juntas; miniatura que falha vira null sem impedir a capa → `{ url, thumbUrl }`) | `UPDATE_COURSE` |
| `POST` | `/courses/:courseId/gallery` | `AddCoursePhotoUseCase` | `UPDATE_COURSE` |
| `DELETE` | `/courses/:courseId/gallery/:photoId` | `DeleteCoursePhotoUseCase` | `UPDATE_COURSE` |
| `GET` | `/admin/courses` | `ListAllCoursesUseCase` | `READ_COURSE` |
| `GET` | `/admin/courses/:courseId` | `GetAdminCourseDetailUseCase` | `READ_COURSE` |

> Cursos com status `PRIVATE` aparecem apenas para admins (`/admin/courses`), mas aceitam inscrições via link direto.
>
> Regras da inscrição pública (`lib/course-registration-rules.ts`, usada pelos três use cases `register-for-course*`), todas → 409: status `UNPUBLISHED`/`IN_PROGRESS` → `RegistrationsUnavailableError`; dia do fim do curso já passou (em Brasília; no último dia ainda aceita) → `CourseEndedError`; prazo `registrationDeadline` em Brasília: gravado com hora 00:00 (painel sem hora) vale **até o fim do dia**; com hora, fecha quando o relógio de Brasília passa de dia + hora. `GET /courses`, `/courses/:id` e `/admin/courses/:id` mandam `registrationDeadline` (dia, AAAA-MM-DD) e `registrationDeadlineTime` ("HH:MM" ou null = dia inteiro) → `RegistrationDeadlinePassedError`; lotado → `CourseFullError`. As datas do curso são hora "de parede" gravada com Z, então o dia é `toISOString().slice(0, 10)`; hoje vem de `todayInBrazil`. O site usa a mesma regra (`utils/course-status.ts` no front).
>
> `GET /courses/:courseId` e `GET /admin/courses/:courseId` retornam `instructors[]` com os campos: `id`, `title`, `category`, `name`, `bio`, `avatar`, `linkedin`, `instagram`, `facebook`. O campo `instructorName` (primeiro instrutor) ainda é retornado para compatibilidade.

### Salas
| Método | Path | Use Case | Autenticação |
|--------|------|----------|--------------|
| `GET` | `/rooms` | `ListRoomsUseCase` | Pública |
| `POST` | `/rooms` | `CreateRoomUseCase` (nome da lista fixa, normalizado; repetido → 409) | `CREATE_COURSE` |
| `PATCH` | `/rooms/:roomId` | `UpdateRoomUseCase` (pode manter nome antigo; trocar exige nome da lista) | `UPDATE_COURSE` |

### Cotações (`market-quote-router.ts`)
| Método | Path | Use Case | Autenticação |
|--------|------|----------|--------------|
| `GET` | `/market-quotes` | `ListMarketQuotesUseCase` (ativos com preço lançado) | Pública |
| `GET` | `/admin/market-quotes` | `ListMarketQuotesUseCase` (os 5 produtos) | `READ_MARKET_QUOTE` |
| `PUT` | `/admin/market-quotes/daily` | `SaveDailyQuotesUseCase` — `{ period, prices: [{ id, priceCents }] }`; data = hoje (America/Sao_Paulo); variação vs lançamento anterior. Corrigir a manhã depois de lançar a tarde só muda o histórico (o preço atual continua o da tarde, com a variação recalculada) | `UPDATE_MARKET_QUOTE` |
| `GET` | `/market-quotes/history?days=` | `ListQuoteHistoryUseCase` — `[{ id, label, unit, points: [{ date, period, priceCents }] }]` dos produtos ativos com ponto na janela (7–365 dias, padrão 90) | Pública |
| `PATCH` | `/admin/market-quotes/:id` | `UpdateQuoteUnitUseCase` — `{ unit }` de `QUOTE_UNITS` (sc 60kg, sc 50kg, sc 40kg, t, kg, @) ou null; refaz o texto do preço atual | `UPDATE_MARKET_QUOTE` |
| `PUT` | `/admin/market-quotes/source` | `UpdateQuotesSourceUseCase` — `{ source }` (fonte exibida; vazio esconde) | `UPDATE_MARKET_QUOTE` |

Não há mais criar/excluir cotação: os produtos são fixos.

No painel, a unidade trocada só vai para o site no "Salvar cotações", junto com os preços: primeiro um `PATCH /admin/market-quotes/:id` por unidade alterada, depois o `PUT /admin/market-quotes/daily` (só se houver preço preenchido). Preço mais de 20% diferente do último lançado pede confirmação no painel.

### Galerias da home (`gallery-router.ts`, use cases em `usecase/gallery-usecases.ts`)
| Método | Path | Use Case | Autenticação |
|--------|------|----------|--------------|
| `GET` | `/galleries` | `ListGalleriesUseCase` (ativas com foto) | Pública |
| `GET` | `/admin/galleries` | `ListGalleriesUseCase` | `READ_BANNER` |
| `POST` | `/admin/galleries` | `CreateGalleryUseCase` | `CREATE_BANNER` |
| `PATCH` | `/admin/galleries/reorder` · `/admin/galleries/:id` | `ReorderGalleriesUseCase` · `UpdateGalleryUseCase` | `UPDATE_BANNER` |
| `DELETE` | `/admin/galleries/:id` | `DeleteGalleryUseCase` (apaga os arquivos) | `DELETE_BANNER` |
| `POST` | `/admin/galleries/:id/photos` | `UploadGalleryPhotoUseCase` (multipart; reduz p/ 1600px, JPEG; máx. 60) | `UPDATE_BANNER` |
| `PATCH` | `/admin/galleries/:id/photos/reorder` · `/admin/galleries/:id/photos/:photoId` (legenda) | `ReorderGalleryPhotosUseCase` · `UpdateGalleryPhotoUseCase` | `UPDATE_BANNER` |
| `DELETE` | `/admin/galleries/:id/photos/:photoId` | `DeleteGalleryPhotoUseCase` | `UPDATE_BANNER` |

### Inscrições
| Método | Path | Use Case | Autenticação |
|--------|------|----------|--------------|
| `POST` | `/courses/:courseId/register` | `RegisterForCourseUseCase` | Pública |
| `POST` | `/courses/:courseId/register-by-cpf` | `RegisterForCourseByCpfUseCase` | Pública |
| `GET` | `/admin/courses/:courseId/registrations` | `ListCourseRegistrationsUseCase` (userData traz memberStatus, membershipValidUntil, boardPosition, `publicContact.title` e `companyMemberships` só de empresas parceiras ativas — selos do painel) | `READ_COURSE` |
| `DELETE` | `/admin/registrations/:registrationId` | `CancelRegistrationUseCase` | `UPDATE_COURSE` |
| `POST` | `/admin/courses/:courseId/registrations` | `AdminRegisterPersonUseCase` (`usecase/admin-course-registrations.ts`) — `{ userDataId }`; inscrição pela equipe, já confirmada; ignora prazo, status e fim do curso; só respeita a lotação (`createWithCapacity`). Já inscrita → 409 "Pessoa já inscrita neste curso"; lotado → 409; pessoa/curso inexistente → 404 | `UPDATE_COURSE` |
| `PATCH` | `/admin/courses/:courseId/registrations/confirm-all` | `ConfirmAllRegistrationsUseCase` — confirma as pendentes; responde `{ confirmed }` (quantas) | `UPDATE_COURSE` |

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
| `GET` | `/admin/news` | `ListAllNewsUseCase` | `READ_NEWS` |

### Banners
| Método | Path | Use Case | Autenticação |
|--------|------|----------|--------------|
| `GET` | `/banners` | `ListBannersUseCase` | Pública |
| `GET` | `/admin/banners` | `ListAllBannersUseCase` | `READ_BANNER` |
| `POST` | `/admin/banners` | `CreateBannerUseCase` | `CREATE_BANNER` |
| `PATCH` | `/admin/banners/:id` | `UpdateBannerUseCase` | `UPDATE_BANNER` |
| `DELETE` | `/admin/banners/:id` | `DeleteBannerUseCase` | `DELETE_BANNER` |
| `POST` | `/admin/banners/:id/image` | `UploadBannerImageUseCase` | `UPDATE_BANNER` |
| `PATCH` | `/admin/banners/reorder` | `ReorderBannersUseCase` | `UPDATE_BANNER` |

`startDate`/`endDate` são instantes; o painel manda o dia escolhido em Brasília (`AAAA-MM-DDT00:00:00.000-03:00` e `…T23:59:59.999-03:00`). `GET /banners` mostra os ativos com início ≤ agora ≤ término (vazio não limita). A migration `20260919120000_banner_dates_brasilia` somou 3h às datas antigas gravadas como 00:00:00.000Z / 23:59:59.999Z.

### Contatos (Formulário público)
| Método | Path | Use Case | Autenticação |
|--------|------|----------|--------------|
| `POST` | `/contacts/message` | `CreateContactMessageUseCase` | Pública |
| `GET` | `/admin/contacts/messages` | `ListContactMessagesUseCase` | `READ_CONTACT` |
| `PATCH` | `/admin/contacts/messages/:messageId` | `MarkContactMessageReadUseCase` (sempre marca como lida) | `UPDATE_CONTACT` |
| `PATCH` | `/admin/contacts/messages/:messageId/unread` | `MarkContactMessageReadUseCase` com `read = false` — rota própria para a auditoria saber qual das duas foi | `UPDATE_CONTACT` |
| `DELETE` | `/admin/contacts/messages/:messageId` | `DeleteContactMessageUseCase` | `UPDATE_CONTACT` |

### Auditoria (`audit-router.ts`, hook em `http/audit-hooks.ts`)
| Método | Path | Use Case | Autenticação |
|--------|------|----------|--------------|
| `GET` | `/admin/audit-logs` | lista paginada (filtros `action`, `entity`, `actorId`, `from`, `to`, `q`); cada linha traz `summary`, a frase pronta | `READ_AUDIT` |

- O hook grava toda mutação com sucesso (método, caminho, `entity`, `targetLabel`); fora da trilha (`skipAudit` em `lib/audit-entity.ts`): `/auth/login`, `/auth/refresh`, `/invites/*`, `/admin/export/*` (a exportação grava a própria linha).
- `entity` vem do caminho (`deriveAuditEntity`, mesma lista do filtro "Tipo" no painel). `targetLabel` = nome do alvo buscado antes da ação (`lookupTargetLabel`: edição, exclusão e POST sobre item existente, ex.: iniciar curso, foto da galeria) ou o nome do corpo.
- `summary` (`lib/audit-sentence.ts`, `describeAuditAction`): rotas especiais por método + caminho com ids trocados por `:id` ("Iniciou o curso", "Adicionou foto à galeria", "Marcou mensagem como lida", "Editou as configurações do site", "Lançou as cotações do dia"…); as demais viram verbo + artigo pelo gênero + entidade ("Editou a galeria "FAEP""). Rota nova com ação diferente de criar/editar/excluir → acrescentar em `SPECIAL`; entidade nova → `AUDIT_ENTITY_NOUNS` e a lista do filtro no painel. A planilha `audit-logs` usa a mesma frase (sem o nome) na coluna "Ação".

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

### Financeiro (`finance-router.ts`)
| Método | Path | Use Case | Autenticação |
|--------|------|----------|--------------|
| `GET` | `/admin/finance/transactions` | `ListFinanceTransactionsUseCase` — paginado + filtros (from, to, type, categoryId, accountId, search); `totals: { incomeCents, expenseCents }` soma todos os lançamentos filtrados (não só a página), sem transferências entre caixas nem "só nota" (mesma regra do `/admin/finance/summary`) | `READ_FINANCE` |

Demais rotas (categorias, caixas, lançamentos, transferências, comprovantes, export, summary) em `finance-router.ts`.

### Endereço
| Método | Path | Use Case | Autenticação |
|--------|------|----------|--------------|
| `GET` | `/address/cep/:cep` | `FetchAddressByCepUseCase` | Pública |

## Paginação

Rotas de listagem aceitam `?page=1&limit=20`. Resposta padrão:

```json
{ "data": [...], "total": 100, "page": 1, "limit": 20, "totalPages": 5 }
```

Todas as rotas de listagem suportam paginação via `?page=1&limit=20`.

### Filtros disponíveis por endpoint

| Endpoint | Query params de filtro |
|----------|------------------------|
| `GET /admin/users` | `search` (nome/email sem diferenciar acento e maiúscula; CPF com ou sem máscara), `memberType`, `memberClassification`, `gender`, `ethnicity`, `educationLevel` |
| `GET /admin/users/admins` | `search` (username) |
| `GET /admin/courses` | `status` (PUBLIC/PRIVATE/UNPUBLISHED), `search` (nome) |
| `GET /admin/news` | `status` (PUBLISHED/UNPUBLISHED) |

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
| `createAddressAdapter` | `adapter/database/address-adapter.ts` | `AddressRepository` |
| `createUserRelationAdapter` | `adapter/database/user-relation-adapter.ts` | `UserRelationRepository` |
| `createPropertyAdapter` | `adapter/database/property-adapter.ts` | `PropertyRepository` |
| `createCompanyAdapter` | `adapter/database/company-adapter.ts` | `CompanyRepository` |
| `createGalleryAdapter` | `adapter/database/gallery-adapter.ts` | `GalleryRepository` |
| `createMarketQuoteAdapter` | `adapter/database/market-quote-adapter.ts` | `MarketQuoteRepository` |
| `createInstructorAdapter` | `adapter/database/instructor-adapter.ts` | `InstructorRepository` |
| `createBannerAdapter` | `adapter/database/banner-adapter.ts` | `BannerRepository` |
| `createContactMessageAdapter` | `adapter/database/contact-message-adapter.ts` | `ContactMessageRepository` |
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
  async execute(request): Promise<{ error?: Error; fooId?: string }> { ... }
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
    if (response.error) {
      return reply.status(errorToStatus(response.error)).send({ error: response.error.message });
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

### 6. Registrar em `http/register-routers.ts`
```ts
app.register(fooRouter, prisma);
```
`registerRouters`, `registerAuditHooks` (`http/audit-hooks.ts`, trilha de auditoria) e `apiErrorHandler` (`http/error-handler.ts`) são usados pelo servidor e pelo app dos testes E2E — rota nova registrada ali já aparece nos dois.

Permissões das regras (`rule-router.ts`) vêm de `Object.values(Permission)`: permissão nova no enum do Prisma já é aceita. Texto de cadastro (títulos, salas) é normalizado com `lib/text.ts` (`upperNoAccents`); links salvos aceitam só http/https (`httpUrl` em `company-schema.ts`).

## Sistema de erros tipados

Os erros de domínio vivem em `src/errors/` divididos por categoria:

| Arquivo | Classe base | Subclasses específicas |
|---------|-------------|------------------------|
| `auth.ts` | `AuthError` | `InvalidCredentialsError` |
| `business-rule.ts` | `BusinessRuleError` | `RoomAlreadyBookedError`, `RegistrationsUnavailableError` |
| `conflict.ts` | `ConflictError` | `UserAlreadyExistsError`, `UsernameAlreadyExistsError`, `AdminAccountAlreadyExistsError`, `EmailOrCpfAlreadyInUseError`, `CourseRegistrationAlreadyExistsError`, `InstructorAlreadyExistsError`, `InstructorAlreadyAssignedError` |
| `not-found.ts` | `NotFoundError` | `CourseNotFoundError`, `UserNotFoundError`, `UserDataNotFoundError`, `AdminNotFoundError`, `NewsNotFoundError`, `RoomNotFoundError`, `RuleNotFoundError`, `RoleNotFoundError`, `PermissionRuleNotFoundError`, `RegistrationNotFoundError`, `PhotoNotFoundError`, `UserRelationNotFoundError`, `PropertyNotFoundError`, `AddressNotFoundError`, `InstructorNotFoundError`, `ContactMessageNotFoundError`, `BannerNotFoundError` |
| `validation.ts` | `ValidationError` | — (único com parâmetro de mensagem, para erros dinâmicos do Zod) |

Use cases lançam a subclasse específica. Controllers usam `errorToStatus(response.error)` de `http/lib/require-permission.ts` para mapear para HTTP status:

```ts
// errorToStatus mapping
NotFoundError      → 404
ConflictError      → 409
BusinessRuleError  → 409
AuthError          → 401
default            → 400
```

### Padrão de error handling nos use cases

```ts
// Use cases retornam { error?: Error; result?: ... } — sem success flag
// Ausência de error == sucesso

// No controller — verificar erro ANTES de send()
if (response.error) {
    return reply.status(errorToStatus(response.error)).send({ error: response.error.message });
}
```

Nunca chamar `reply.send()` duas vezes — causa erro de dupla resposta no Fastify.

### Regra: listagens sempre retornam 200

Use cases de listagem **nunca** retornam `NotFoundError` quando o resultado está vazio. Retornam sempre 200 com array vazio ou objeto paginado zerado:

```ts
// Correto — listagem sem resultados
return { result: { data: [], total: 0, page: 1, limit: 20, totalPages: 0 } };
return { items: [] };

// ERRADO — nunca fazer isso em listagem
if (!items.length) return { error: new SomethingNotFoundError() };
```

404 só é correto em operações de **detalhe** (busca por ID único) ou **ação** (update/delete) quando o recurso não existe.

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

O `StorageRepository` é instanciado via `createStorageAdapter()` (sem parâmetros — retorna o `SupabaseStorageAdapter`, que lê `SUPABASE_URL` e `SUPABASE_SECRET_KEY` do env).

## Autenticação

O JWT é gerado por `signAdminToken` (em `usecase/login-user-admin.ts`) com payload `{ userId, username, role, authTime }` e expiração de 8h (`ADMIN_TOKEN_TTL`); `authTime` = momento do login (segundos), preservado na renovação. `userId` no payload = `UserAdmin.id`. `POST /auth/refresh` (`RefreshAdminTokenUseCase`) troca um token ainda válido por um novo de 8h se o admin continua existindo (não excluído, com regra) e o login foi há no máximo 24h (`ADMIN_SESSION_MAX_SECONDS`; token sem `authTime` conta do `iat`); senão → 401. Login e refresh têm rate limit de 10 por 5 minutos, contado por IP de quem acessa (`trustProxy: 1` em `index.ts`: em produção a API só é acessível pelo proxy do Coolify). O painel renova sozinho enquanto está em uso.

Para rotas protegidas, verificar o token e checar a permissão na `Rule` do admin:
```ts
const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
const admin = await userAdminRepository.findById(decoded.userId);
const rule = await ruleRepository.findById(admin.rulesId);
const canDo = rule.permissions.includes('CREATE_COURSE');
```

No `CreateUserAdminUseCase`, o token é passado como `creatorToken` no request — o próprio use case faz a verificação de permissão.

Para extrair o token do header no controller:
```ts
const token = request.headers['authorization']?.replace('Bearer ', '') ?? '';
```

## Inicialização automática

Na primeira execução (`firstInitialize` em `index.ts`), o servidor cria:
1. Rule `SUPER_RULE` com todas as permissões (atualizada automaticamente se novas permissões forem adicionadas)
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
npx vitest run           # testes unitários
DATABASE_TEST_URL=postgresql://USER:SENHA@localhost:PORTA/BANCO npm run test:e2e
# E2E: banco LOCAL descartável (recusa host que não seja localhost); aplica as
# migrations com `migrate deploy` e limpa as tabelas entre testes. O CI
# (.github/workflows/ci.yml) roda lint, tsc, unitários e E2E com Postgres 16.
```

## Observações importantes

- Importações internas devem usar extensão `.js` nos paths (requisito ESM)
- Os tipos do Prisma são importados de `src/generated/prisma/` — nunca editar esses arquivos
- O `PrismaClient` é importado de `../generated/prisma/client.js` (não do pacote padrão)
- O `StorageAdapter` é instanciado via factory `createStorageAdapter()` (Supabase Storage; buckets devem existir e ser públicos: `avatars`, `course-banners`, `news-banners`)
- Todos os métodos de busca por email/CPF/telefone no `UserDataAdapter` filtram `isDeleted: false` — soft-deleted users não retornam em conflict checks
- **Busca sem acento** (`list-filters.ts`, pessoas/empresas/Unimed/admins e as exportações): "joao" acha "João" e vice-versa. Os nomes são comparados nas colunas `UserData.nameSearch`, `Company.nameSearch`/`tradeNameSearch` com `searchKey(termo)` (minúsculo, sem acento). Essas colunas são preenchidas por trigger (`*_fill_search`, função SQL `immutable_unaccent_lower`, migração `20260919100000_search_normalized`) — a aplicação nunca grava nelas; trigger em vez de coluna GENERATED para o `migrate dev` não acusar diferença. CPF/CNPJ só entram na busca quando o termo parece documento (só números, `.`, `-`, `/`), comparando os dígitos.
