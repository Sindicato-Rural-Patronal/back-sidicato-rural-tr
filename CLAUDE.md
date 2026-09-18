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
GEOIP_DISABLED=              # 1 = não consulta o local do IP na auditoria (ipwho.is)
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
| `UserData`               | id, name, email (opcional; vazio = null), phone (obrigatório) — e-mail e telefone podem repetir entre pessoas (casal, família; índices únicos removidos na migration `20260920090000_userdata_contact_not_unique`), cpf (a identidade: único entre ativos; só dígitos; vazio = null — `UserDataAdapter` normaliza CPF e e-mail em create/update), nameSearch (busca, preenchida por trigger), avatar, nickname, maritalStatus, phone2, phone3, rg, rgIssuer, rgIssuedAt, birthDate, driverLicense, driverLicenseCategory, birthPlace, nationality, gender, ethnicity, educationLevel, functionalCategory, specialNeeds, memberClassification, cadPro (até 5), familyIncome, memberType (lista fixa em `lib/member-types.ts`: ALUNO, PRODUTOR RURAL, TRABALHADOR RURAL ASSALARIADO, TRABALHADOR RURAL AUTONOMO; fora da lista → 400), boardPosition, boardMember, memberStatus, memberSince, memberNotes, memberNotesNumber, addressId (FK). Colunas cnpj/isPartner/partner* foram removidas (migration `20260917140000`): CNPJ antigo e tipo de membro fora da lista (ex.: SOCIO) foram copiados para `memberNotes` — empresa/parceria é `Company` |
| `Company`                | id, name (razão social), tradeName (nome fantasia), nameSearch/tradeNameSearch (busca, preenchidas por trigger), addressId (FK→Address, sede; SetNull), cnpj (só dígitos; único entre ativas, índice parcial), stateRegistration, type (PRIVATE/PUBLIC), phone, phone2, phone3, email, website, notes, isPartner, partnerUrl, partnerLogo, partnerOrder, primaryPropertyId, isDeleted (soft delete) |
| `CompanyMember`          | id, companyId (FK), userDataId (FK), title (texto livre em maiúsculas) — único por (companyId, userDataId) |
| `UserAdmin`              | id, username, passwordHash, userDataId (FK), rulesId (FK)                                                  |
| `PublicContact`          | id, userDataId (FK único, cascade), title (cargo exibido), order — contatos da página Contato; qualquer pessoa, com ou sem login |
| `SiteSetting`            | key, value — chaves `social.*`, `org.*` (telefone, e-mail, endereço, horário, busca do mapa), `about.text`, `quotes.source`, `audit.retentionDays` |
| `UserInstructor`         | id, userDataId (FK único), bio, linkedin, instagram, facebook                                              |
| `Rule`                   | id, name, description, permissions (Permission[])                                                          |
| `Course`                 | id, name, description, roomId (FK), startTime, endTime, status, price, workloadHours, coverImage (coluna `bannerUrl`, JPEG 1920×1080), coverImageThumb (coluna `bannerThumbUrl`, WebP 640×360 para os cards; migration `20260919110000`; null em cursos antigos → front usa a capa), eventNumber, minStudents, preEnrolled, waitlist, registrationDeadline, observations |
| `CourseInstructor`       | id, courseId (FK), instructorId (FK→UserInstructor), title, category                                      |
| `RoomBooking`            | id, type (`BookingType`: EVENT/MEETING), title, description, roomId (FK→room, cascade), startTime, endTime (hora "de parede" com Z, como o curso), responsibleUserDataId (FK→UserData, SetNull), responsibleName (responsável sem cadastro), seriesId (mesma repetição), publicOnSite (aparece em `GET /events`; só EVENT), publicDescription (texto do evento no site — `description` é observação interna e nunca sai para o público), isDeleted/deletedAt — índices (roomId, startTime), (seriesId) e (publicOnSite, startTime); CHECK `endTime > startTime`. Migrations `20260922090000_room_bookings` e `20260923090000_news_schedule_public_events` |
| `Room`                   | id, name (lista fixa em `lib/room-names.ts`: AUDITORIO, COZINHA, SALA DE VIDEO CONFERENCIA, SALA 1, SALA 2, SALA APL; único), description, maxCapacity, addressId (FK) |
| `News`                   | id, title, content, summary, bannerUrl, status, publishedAt (data mostrada ao leitor), publishAt (agendamento: hora "de parede" de Brasília com Z; null = no ar assim que o status for PUBLISHED) — índice (status, publishAt). Migration `20260923090000_news_schedule_public_events` |
| `CoursePhoto`            | id, courseId (FK), url, caption                                                                            |
| `CourseUserRegistration` | id, courseId (FK), userDataId (FK), confirmed, attended (presença: null = sem marcar, true = presente, false = faltou; migration `20260920100000_course_completed_attendance`), isDeleted |
| `Address`                | id, type (URBAN/RURAL), city, state, zipCode, complement, notes, street, number, neighborhood, localityName, road, km, lot, section |
| `Property`               | id, userDataId (FK?), companyId (FK?), name, registration, addressId (FK) — CHECK `Property_single_owner`: exatamente um dono (pessoa OU empresa) |
| `UserRelation`           | id, sourceId (FK→UserData), targetId (FK→UserData), label (texto livre)                                    |
| `Banner`                 | id, title, subtitle, imageUrl, active, order, buttons (JSON), startDate, endDate                           |
| `ContactMessage`         | id, name, email, phone, subject, message, read, createdAt                                                  |
| `MarketQuote`            | id, label (único; produtos fixos SOJA, MILHO, TRIGO, MANDIOCA, DOLAR criados na migration), value (texto pronto), priceCents, unit (configurável no painel), period (MORNING/AFTERNOON), variation, referenceDate (dia do lançamento), isActive, order |
| `MarketQuoteHistory`     | id, marketQuoteId (FK), value, numeric, referenceDate, period — único por produto/dia/período (`@@unique`; relançar substitui) |
| `GalleryAlbum`           | id, title, description, linkUrl, isActive, order — galerias da home (História do Sindicato, FAEP, Patrulha Rural) |
| `GalleryPhoto`           | id, albumId (FK, cascade), url, storageKey, caption, order |
| `Notification`           | id, type, title, body, link, permission (exigida para ver), entityId, createdAt — eventos do sino do painel (migration `20260921090000_notifications`) |
| `NotificationRead`       | id, notificationId (FK, cascade), adminId (UserAdmin.id, sem FK), readAt — único por (notificationId, adminId); sem linha = não lida |

## Enums

| Enum | Valores |
|------|---------|
| `CourseStatus` | `PUBLIC`, `PRIVATE`, `UNPUBLISHED`, `IN_PROGRESS` (iniciado pelo painel), `COMPLETED` (concluído à mão pelo painel) |
| `NewsStatus` | `PUBLISHED`, `UNPUBLISHED` |
| `BookingType` | `EVENT`, `MEETING` (reservas de sala) |
| `Permission` | `CREATE_USER`, `UPDATE_USER`, `DELETE_USER`, `READ_USER`, `CREATE_COURSE`, `UPDATE_COURSE`, `DELETE_COURSE`, `READ_COURSE`, `CREATE_RULE`, `UPDATE_RULE`, `DELETE_RULE`, `READ_RULE`, `CREATE_USER_ADMIN`, `UPDATE_USER_ADMIN`, `DELETE_USER_ADMIN`, `READ_USER_ADMIN`, `CREATE_NEWS`, `UPDATE_NEWS`, `DELETE_NEWS`, `READ_NEWS`, `READ_CONTACT`, `UPDATE_CONTACT`, `CREATE_BANNER`, `UPDATE_BANNER`, `DELETE_BANNER`, `READ_BANNER`, `READ_AUDIT`, `UPDATE_AUDIT` (+ `*_MARKET_QUOTE`, `*_FINANCE`, `*_CONVENIO`) |
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
READ_AUDIT     UPDATE_AUDIT   (ver a trilha · configurar o tempo de guarda)
```

> As demais (`*_MARKET_QUOTE`, `*_FINANCE`, `*_CONVENIO`) estão no enum `Permission` em `prisma/schema.prisma`.

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
| `PATCH` | `/admin/users/:id/properties/:propertyId` | `UpdatePropertyUseCase` | `UPDATE_USER` |
| `DELETE` | `/admin/users/:id/properties/:propertyId` | `DeletePropertyUseCase` | `UPDATE_USER` |
| `POST` | `/admin/users/:id/avatar` | `UploadAvatarUseCase` | `UPDATE_USER` |
| `GET` | `/admin/users/duplicates?limit=50` | `ListDuplicatePeopleUseCase` | `READ_USER` |
| `GET` | `/admin/users/merge-preview?ids=a,b` | `ComparePeopleForMergeUseCase` | `READ_USER` |
| `POST` | `/admin/users/merge` | `MergeUsersUseCase` | `DELETE_USER` + `UPDATE_USER` |

> Cadastro e edição de pessoa (`POST /users`, `PATCH /users/:id`): nome, telefone e CPF obrigatórios no cadastro; e-mail opcional (vazio ou null = sem e-mail; preenchido precisa ser válido — `lib/person-email.ts`). E-mail e telefone podem repetir; só o CPF de outra pessoa ativa dá 409 `CpfAlreadyInUseError` ("CPF já cadastrado para outra pessoa."). RG repetido continua 409. As respostas com `email` de pessoa o declaram `nullable`.

> **Cadastros repetidos** (`user-merge-router.ts`, `usecase/merge-users.ts`, `adapter/database/user-merge-adapter.ts`): a inscrição pública só acha a pessoa pelo CPF, então quem estava cadastrado sem CPF ganha um segundo cadastro ao se inscrever.
> - `GET /admin/users/duplicates` → `{ groups: [{ key, reason: NOME|TELEFONE|EMAIL, people: [{ id, name, cpf, email, phone, createdAt, hasLogin, counts: { registrations, companies, properties, relations } }] }] }`. Grupos de pessoas ativas com o mesmo `nameSearch`, telefone (só dígitos) ou e-mail (minúsculo) em que **pelo menos uma está sem CPF**; o mesmo par que casa por dois motivos sai uma vez só. `hasLogin` = existe `UserAdmin` (mesmo excluído — a coluna é única).
> - `GET /admin/users/merge-preview?ids=a,b` → os dois cadastros no mesmo formato, para a comparação lado a lado do painel.
> - `POST /admin/users/merge` `{ keepId, removeId }` → `{ keepId, removedId, movedRegistrations, movedCompanies, movedProperties, movedRelations, filledFields[] }`. **Numa transação só**, vão de `removeId` para `keepId`: inscrições em curso (inscrita nos dois no mesmo curso → fica a de `keepId`, a outra é cancelada), vínculos com empresas (vínculo repetido → fica o título de `keepId`, o outro é apagado), propriedades, relações nos dois sentidos (a relação entre os dois cadastros e as repetidas viram exclusão lógica), beneficiário Unimed (+ `titularId` de quem apontava para o removido), contato público, `UserInstructor`, `UserAdmin`, `AdminInvite` e `RoomBooking.responsibleUserDataId` — Unimed, contato público e instrutor só quando `keepId` ainda não tem o seu (contato público repetido é apagado, senão "Nossa Equipe" mostraria alguém excluído). Depois, os campos **vazios** de `keepId` são preenchidos com os do removido (CPF, RG, nascimento, e-mail, telefone, CAD/PRO…; nada preenchido é sobrescrito) e o removido vira `isDeleted` — nunca é apagado. A ordem importa: o removido é excluído **antes** de o CPF ir para o que fica (o índice único de CPF vale entre ativos).
> - Recusa: mesmo id e cadastro já excluído → 400; CPFs diferentes → 409 "Cadastros com CPFs diferentes não podem ser juntados."; os dois com conta de acesso ao painel → 409 (`UserAdmin.userDataId` é único).

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
| `PATCH` | `/admin/companies/:id/properties/:propertyId` | `UpdatePropertyUseCase` (mesmo use case da pessoa; dono errado → 404) | `UPDATE_USER` |
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

- Conjuntos: `people`, `companies`, `properties`, `unimed` (READ_USER), `admins` (READ_USER_ADMIN), `courses`, `registrations`, `room-bookings` (READ_COURSE), `contact-messages` (READ_CONTACT), `audit-logs` (READ_AUDIT).
- `room-bookings` aceita `from`, `to` (AAAA-MM-DD), `roomId`, `type` e `search`; colunas Tipo, Título, Sala, Início, Término (DD/MM/AAAA HH:MM, hora gravada), Responsável, Descrição, Série (Sim/Não).
- `ids` exporta só esses (seleção ou um registro; lista vazia → 400); sem `ids`, os mesmos filtros da listagem (`adapter/database/list-filters.ts`, compartilhado com os adapters das listas). `properties` aceita `ownerIds`; `registrations` aceita `courseIds`.
- Headers: `Content-Disposition` (`pessoas-AAAA-MM-DD.csv`, ou `pessoa-<nome>-AAAA-MM-DD.csv` para um registro) e `X-Export-Count`.
- Filtros validados como na listagem (enums de sexo/etnia/escolaridade; datas `AAAA-MM-DD`, dia em Brasília). `audit-logs` sai com no máximo 20.000 linhas mais recentes.
- Horários de curso saem como gravados (`csvWallClock`: o painel grava o relógio local com Z); momentos como "criado em" saem no horário de Brasília (`csvDateTime`).
- Cada exportação grava um AuditLog com `method: 'EXPORT'` e entity "Exportação" (filtro `action=export` na auditoria), com IP e User-Agent; o hook de auditoria ignora `/admin/export/*` para não duplicar e só preenche o local depois da resposta.
- `audit-logs` tem também as colunas IP, Local, Aparelho e Alterações ("Campo: antes → depois; …").

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
> Regras da inscrição pública (`lib/course-registration-rules.ts`, usada pelos três use cases `register-for-course*`), todas → 409: status `UNPUBLISHED`/`IN_PROGRESS` → `RegistrationsUnavailableError`; status `COMPLETED` ou dia do fim do curso já passou (em Brasília; no último dia ainda aceita) → `CourseEndedError`; prazo `registrationDeadline` em Brasília: gravado com hora 00:00 (painel sem hora) vale **até o fim do dia**; com hora, fecha quando o relógio de Brasília passa de dia + hora. `GET /courses`, `/courses/:id` e `/admin/courses/:id` mandam `registrationDeadline` (dia, AAAA-MM-DD) e `registrationDeadlineTime` ("HH:MM" ou null = dia inteiro) → `RegistrationDeadlinePassedError`; lotado → `CourseFullError`. As datas do curso são hora "de parede" gravada com Z, então o dia é `toISOString().slice(0, 10)`; hoje vem de `todayInBrazil`. O site usa a mesma regra (`utils/course-status.ts` no front).
>
> `GET /courses/:courseId` e `GET /admin/courses/:courseId` retornam `instructors[]` com os campos: `id`, `title`, `category`, `name`, `bio`, `avatar`, `linkedin`, `instagram`, `facebook`. O campo `instructorName` (primeiro instrutor) ainda é retornado para compatibilidade.

### Salas
| Método | Path | Use Case | Autenticação |
|--------|------|----------|--------------|
| `GET` | `/rooms` | `ListRoomsUseCase` | Pública |
| `POST` | `/rooms` | `CreateRoomUseCase` (nome da lista fixa, normalizado; repetido → 409) | `CREATE_COURSE` |
| `PATCH` | `/rooms/:roomId` | `UpdateRoomUseCase` (pode manter nome antigo; trocar exige nome da lista) | `UPDATE_COURSE` |
| `DELETE` | `/rooms/:roomId` | `DeleteRoomUseCase` — 409 com curso vinculado (`RoomHasCoursesError`) ou com reserva futura (`RoomHasBookingsError`) | `DELETE_COURSE` |

### Unimed (`unimed-router.ts`, use cases `*-unimed.ts`)

Convênio 1:1 com `UserData` (a pessoa vive no `UserData`; aqui só os campos do plano). Permissões de pessoa (`READ/CREATE/UPDATE/DELETE_USER`).

| Método | Path | Use Case | Autenticação |
|--------|------|----------|--------------|
| `GET` | `/admin/unimed` | `ListUnimedUseCase` — paginado; `?search` (nome/CPF/telefone da pessoa) e `?userDataId=` (os cadastros da pessoa **e** aqueles em que ela é o titular — aba Unimed da ficha) | `READ_USER` |
| `GET` | `/admin/unimed/:id` | `GetUnimedUseCase` | `READ_USER` |
| `POST` | `/admin/unimed` | `CreateUnimedUseCase` (segundo cadastro ativo da mesma pessoa → 409) | `CREATE_USER` |
| `PATCH` | `/admin/unimed/:id` | `UpdateUnimedUseCase` | `UPDATE_USER` |
| `DELETE` | `/admin/unimed/:id` | `DeleteUnimedUseCase` (soft) | `DELETE_USER` |

- **Listas fixas** (`lib/unimed-options.ts`): `tipoMovimento` (INCLUSAO DE TITULAR/DEPENDENTE, EXCLUSAO DE TITULAR/DEPENDENTE, ALTERACAO CADASTRAL, REATIVACAO) e `grauDependencia` (TITULAR, CONJUGE, FILHO(A), ENTEADO(A), PAI/MAE, OUTRO). Valor fora da lista → 400, **menos** quando é o que já estava gravado naquele registro: cadastro antigo do sistema legado (texto livre) continua salvável sem perder o dado — `unimedFieldsIssue(data, previous)`. `plano` e `tipoDependente` seguem texto livre.
- **CNS**: chega mascarado e é gravado só com dígitos; 15 dígitos, com a mesma folga para o valor antigo do registro.
- Migration `20260923120500_unimed_fixed_lists` só arruma dados existentes (maiúsculas quando o texto já é item da lista; tira a máscara do CNS quando sobram 15 dígitos) — nada é apagado.

### Reservas de sala (`room-booking-router.ts`, use cases em `usecase/room-booking-usecases.ts`)

Eventos e reuniões que ocupam as salas, além dos cursos. Mesmas permissões dos cursos.

| Método | Path | Use Case | Autenticação |
|--------|------|----------|--------------|
| `GET` | `/events` | `ListPublicEventsUseCase` — eventos publicados que ainda não terminaram (`endTime >= agora` no relógio de Brasília), por início, até 50; devolve `{ id, title, description (= publicDescription), startTime, endTime, roomName }` | Pública |
| `GET` | `/admin/room-bookings?from&to[&roomId][&type][&search]` | `ListRoomBookingsUseCase` | `READ_COURSE` |
| `GET` | `/admin/room-schedule?from&to[&roomId]` | `GetRoomScheduleUseCase` (cursos + reservas) | `READ_COURSE` |
| `POST` | `/admin/room-bookings` | `CreateRoomBookingUseCase` (com `repeat` opcional) | `CREATE_COURSE` |
| `PATCH` | `/admin/room-bookings/:id` | `UpdateRoomBookingUseCase` (só esta ocorrência) | `UPDATE_COURSE` |
| `DELETE` | `/admin/room-bookings/:id?scope=one|future` | `DeleteRoomBookingUseCase` (exclusão lógica) → `{ deleted }` | `DELETE_COURSE` |

- **Horários**: hora "de parede" de Brasília rotulada em UTC, igual aos cursos (`2026-10-05T08:00:00.000Z` = 08:00 em Terra Roxa). O painel monta a string, o backend nunca converte fuso.
- **`from`/`to`** (`AAAA-MM-DD`, obrigatórios, `to >= from`, no máximo 370 dias) delimitam `[from 00:00, to + 1 dia 00:00)`; volta **tudo o que sobrepõe** o período, por início, sem paginação (o painel acha a reserva a editar nessa lista — não há GET por id).
- Item: `{ id, type, title, description, publicOnSite, publicDescription, roomId, roomName, startTime, endTime, responsible: { id, name } | null, responsibleName, seriesId }`. Agenda: `{ kind: COURSE|EVENT|MEETING, id, title, roomId, roomName, startTime, endTime, status (do curso; null na reserva), seriesId, publicOnSite (false em curso e reunião) }` — a agenda traz os cursos de qualquer status (não excluídos), quem filtra é a tela.
- **Criar**: `{ type, title, description?, publicOnSite?, publicDescription?, roomId, startTime, endTime, responsibleUserDataId?, responsibleName?, repeat?: { frequency: WEEKLY|MONTHLY, until: AAAA-MM-DD } }` → 201 `{ ids, seriesId }`. `repeat` gera uma ocorrência por semana ou por mês no mesmo dia (mês sem o dia, ex. 31, é pulado), até `until` inclusive, no máximo 60 (mais que isso → 400); cada ocorrência é uma linha com o mesmo `seriesId` (`null` quando só há uma). Título aparado, até 150 caracteres — o texto vai como veio (quem escreve em maiúsculas é o painel).
- **Editar**: todos os campos opcionais, muda **só aquela ocorrência**; `description`, `publicDescription`, `responsibleUserDataId` e `responsibleName` aceitam `null` para limpar. Conflito só é checado quando sala ou horário mudam.
- **No site** (`effectivePublicOnSite`): só `type: EVENT` pode ser publicado — reunião é forçada a `publicOnSite: false` (marcar no corpo não adianta) e virar reunião tira a publicação e limpa `publicDescription`. `GET /events` (pública, sem token) devolve os eventos publicados que ainda não terminaram (`endTime >= agora` no relógio de Brasília), por início, no máximo 50, com `{ id, title, description (= `publicDescription`), startTime, endTime, roomName }` — as observações internas (`description`) nunca saem.
- **Conflito** (`usecase/room-availability.ts`, compartilhado com os cursos): mesma sala, `existente.início < novo.fim` e `existente.fim > novo.início` (encostar é permitido), contra **cursos e reservas** não excluídos. Todas as ocorrências são checadas antes de gravar, dentro da transação (trava por sala com `pg_advisory_xact_lock`): qualquer conflito → nada é criado e a resposta é 409 `Sala ocupada: Curso "X" em 05/10 08:00–12:00` (rótulos Curso/Evento/Reunião, primeiro conflito; o dia do término só aparece quando é outro dia). Criar/editar curso usa a mesma checagem — `CourseRepository.findRoomConflict` — e mostra a mesma mensagem (status de sempre: `POST /courses` responde 400, `PATCH /courses/:id` responde 409).
- **Excluir**: `scope=one` (padrão) só aquela; `scope=future` aquela e as seguintes da mesma série (`startTime >=`), sempre exclusão lógica → `{ deleted }`.
- **Sala**: `DELETE /rooms/:roomId` recusa (409) enquanto houver reserva não excluída terminando de agora em diante (relógio de Brasília). Reservas passadas não impedem — caem junto com a sala (FK `ON DELETE CASCADE`).

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
| `POST` | `/courses/:courseId/register-full` | `RegisterForCourseFullUseCase` (cria a pessoa com rg, nascimento e endereço como propriedade principal) | Pública |
| `GET` | `/admin/courses/:courseId/registrations` | `ListCourseRegistrationsUseCase` (userData traz memberStatus, membershipValidUntil, boardPosition, `publicContact.title` e `companyMemberships` só de empresas parceiras ativas — selos do painel) | `READ_COURSE` |
| `DELETE` | `/admin/registrations/:registrationId` | `CancelRegistrationUseCase` | `UPDATE_COURSE` |
| `POST` | `/admin/courses/:courseId/registrations` | `AdminRegisterPersonUseCase` (`usecase/admin-course-registrations.ts`) — `{ userDataId }`; inscrição pela equipe, já confirmada; ignora prazo, status e fim do curso; só respeita a lotação (`createWithCapacity`). Já inscrita → 409 "Pessoa já inscrita neste curso"; lotado → 409; pessoa/curso inexistente → 404 | `UPDATE_COURSE` |
| `PATCH` | `/admin/courses/:courseId/registrations/confirm-all` | `ConfirmAllRegistrationsUseCase` — confirma as pendentes; responde `{ confirmed }` (quantas) | `UPDATE_COURSE` |
| `POST` | `/admin/courses/:courseId/start` | `StartCourseUseCase` — status → `IN_PROGRESS`; só exige ao menos uma inscrição (sem inscrições → 400). Inscrições não confirmadas **não** impedem (o painel só avisa quantas) | `UPDATE_COURSE` |
| `PATCH` | `/admin/courses/:courseId/complete` | `CompleteCourseUseCase` (`usecase/complete-course.ts`) — status → `COMPLETED`, sempre manual; só a partir de `IN_PROGRESS` (outro status → 409 "Só é possível concluir um curso que está em andamento."); responde `{ id, status }`. A edição do curso (`PATCH /courses/:id`) também aceita `COMPLETED`/`IN_PROGRESS`, para desfazer | `UPDATE_COURSE` |
| `PATCH` | `/admin/registrations/:registrationId/attendance` | `SetRegistrationAttendanceUseCase` (`usecase/course-attendance.ts`) — `{ attended: true \| false \| null }` (presente, faltou, desmarcar) → `{ id, attended }`; inscrição inexistente/cancelada → 404 | `UPDATE_COURSE` |
| `PATCH` | `/admin/courses/:courseId/registrations/attendance` | `SetUnmarkedAttendanceUseCase` — `{ attended: boolean }` (null → 400) em todas as inscrições **confirmadas**, ativas e ainda sem marcar (quem já foi marcado e as não confirmadas ficam como estão) → `{ updated }` | `UPDATE_COURSE` |

> Presença: `attended` vem em `GET /admin/courses/:courseId/registrations` e na planilha `registrations` (coluna "Presença": Presente / Faltou / vazio). O painel mostra os botões Presente/Faltou quando o curso já começou (em andamento, concluído ou chegou o dia do início) e emite certificado só para inscrição confirmada que não foi marcada como falta. `COMPLETED` se comporta como `IN_PROGRESS` na visibilidade (fora de `GET /courses`, página abre pelo link) e nunca aceita inscrição.

> Inscrição pública (`register` e `register-full`): e-mail opcional; a pessoa é achada **só pelo CPF** (`findByCpf`) — e-mail/telefone iguais aos de outra pessoa não vinculam, criam cadastro próprio. CPF criado ao mesmo tempo por outra inscrição → 409 "CPF já cadastrado para outra pessoa.".

### Notícias
| Método | Path | Use Case | Autenticação |
|--------|------|----------|--------------|
| `GET` | `/news` | `ListNewsUseCase` — só as publicadas e já no ar (agendada para depois fica de fora) | Pública |
| `GET` | `/news/:newsId` | `GetNewsDetailUseCase` — rascunho e agendada dão 404, mesmo com o link | Pública |
| `POST` | `/news` | `CreateNewsUseCase` | `CREATE_NEWS` |
| `PATCH` | `/news/:newsId` | `UpdateNewsUseCase` | `UPDATE_NEWS` |
| `DELETE` | `/news/:newsId` | `DeleteNewsUseCase` | `DELETE_NEWS` |
| `POST` | `/news/:newsId/banner` | `UploadNewsBannerUseCase` | `UPDATE_NEWS` |
| `POST` | `/news/:newsId/image` | `UploadNewsBlockImageUseCase` | `UPDATE_NEWS` |
| `GET` | `/admin/news` | `ListAllNewsUseCase` (filtros `status` = PUBLISHED/SCHEDULED/UNPUBLISHED e `search` por título) | `READ_NEWS` |

- **Agendamento** (`usecase/news-visibility.ts`): `publishAt` é hora "de parede" de Brasília rotulada em UTC (como os cursos). `null`/ausente = no ar assim que o status for PUBLISHED; no futuro = só aparece depois (lista e detalhe públicos comparam com `nowWallClock()`). Rascunho nunca guarda agendamento e voltar para rascunho descarta o que havia. Quando a notícia é agendada e `publishedAt` não vem no corpo, a data mostrada ao leitor passa a ser a do agendamento. `publishAt` no corpo de `POST /news` e `PATCH /news/:newsId` (null = publicar agora).

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
| `GET` | `/admin/audit-logs` | lista paginada (filtros `action` = create, edit, delete, export, login, login_failed (LOGIN_FAILED + LOGIN_BLOCKED); `entity`, `actorId`, `ip` (exato), `from`, `to`, `q`); cada linha traz `summary` (frase pronta), `ip`, `location`, `device` ("Chrome no Windows", `lib/user-agent.ts`), `userAgent` e `changes` | `READ_AUDIT` |
| `GET` | `/admin/audit-settings` | `GetAuditRetentionUseCase` + o registro mais antigo e o total (`{ retentionDays, options, oldestAt, total }`) | `READ_AUDIT` |
| `PATCH` | `/admin/audit-settings` | `UpdateAuditRetentionUseCase` — `{ retentionDays }` (0 = para sempre, senão 30 a 3650); aplica a limpeza na hora e devolve `deleted` | `UPDATE_AUDIT` |

- O hook grava toda mutação com sucesso (método, caminho, `entity`, `targetLabel`); fora da trilha (`skipAudit` em `lib/audit-entity.ts`): `/auth/refresh`, `/invites/*`, `/admin/export/*` (a exportação grava a própria linha), `/admin/notifications/read` e `/auth/login` (registro próprio, abaixo).
- De onde veio (toda linha, inclusive EXPORT e login): `ip` (`request.ip`, real por causa do `trustProxy: 1`), `userAgent` bruto (até 300 caracteres) e `location` "Cidade, UF, País" (`lib/geoip.ts`). **O IP do cliente é enviado ao ipwho.is** (HTTPS, gratuito, sem chave, `lang=pt-BR`; tem limite de uso no plano gratuito): timeout 2 s, cache em memória por IP (24 h; falha 10 min; até 1000 IPs), IP local/reservado não consulta, nunca lança (falha → null). A consulta roda no `onResponse`, depois da resposta; a exportação grava a linha antes de responder e o hook preenche o local depois (`fillAuditLocationLater`). Desligada com `NODE_ENV=test` ou `GEOIP_DISABLED=1`.
- O que mudou (`changes` = `[{ field, before, after }]`, `lib/audit-snapshot.ts` + `lib/audit-diff.ts`): em PATCH/PUT/DELETE autenticados de um registro identificável pelo caminho (pessoa, admin/próprio perfil, regra, instrutor, propriedade, relação, Unimed, convite, empresa e vínculo, curso/conclusão, foto do curso, instrutor do curso, inscrição/confirmação/presença/ficha, sala, reserva de sala (sala e responsável pelo nome; sem `seriesId`), banner, notícia, convênio, galeria e foto, contato público, mensagem, configurações do site, cotação/fonte/cotações do dia, categoria, caixa, lançamento, comprovante) o preHandler lê o registro e o onResponse relê depois do sucesso; guarda só os campos alterados (máx. 40). Exclusão guarda os campos preenchidos como `before` (`after` null). Fora: `passwordHash` (senha trocada vira `{ field: 'password', after: 'alterada' }`), `token`, colunas Bytes (nunca lidas), `*Search`, `id`, `createdAt`/`updatedAt`/`deletedAt`/`isDeleted`; textos cortados em 300, datas ISO, listas "a, b", JSON como texto. Ids de relação viram nomes (`room`, `person`, `rule`, `category`…). Rota nova que edita um registro → acrescentar em `SNAPSHOTS`. Erro na leitura nunca afeta a request (linha sai sem `changes`).
- Login (`POST /auth/login`): 2xx → `LOGIN` com `actorId` (lido do token no `onSend`); 401 → `LOGIN_FAILED`; 429 → `LOGIN_BLOCKED` (o limite da rota conta em `preValidation` para o corpo já estar lido). `targetLabel` = usuário digitado (até 60 caracteres); a senha nunca é lida pelo hook. `entity` "Login".
- Retenção configurável (`usecase/audit-retention.ts` + `adapter/database/audit-cleanup.ts`): o tempo de guarda fica em `SiteSetting['audit.retentionDays']` (0/ausente = guardar para sempre, que é o padrão; o painel oferece 0, 90, 180, 365 e 730 dias e a API aceita 0 ou 30–3650). A limpeza roda a reboque de uma gravação na trilha (como a dos eventos do sino), no máximo uma vez por hora por processo, apaga em lotes de 1000 (até 20.000 por rodada) e loga quantas linhas saíram; `PATCH /admin/audit-settings` aplica na hora. Nunca apaga com guarda 0. A permissão `UPDATE_AUDIT` foi concedida na migration a toda regra que já tinha `READ_AUDIT`.
- `entity` vem do caminho (`deriveAuditEntity`, mesma lista do filtro "Tipo" no painel). `targetLabel` = nome do alvo buscado antes da ação (`lookupTargetLabel`: edição, exclusão e POST sobre item existente, ex.: iniciar curso, foto da galeria) ou o nome do corpo.
- `summary` (`lib/audit-sentence.ts`, `describeAuditAction`): rotas especiais por método + caminho com ids trocados por `:id` ("Iniciou o curso", "Adicionou foto à galeria", "Marcou mensagem como lida", "Editou as configurações do site", "Lançou as cotações do dia"…); as demais viram verbo + artigo pelo gênero + entidade ("Editou a galeria "FAEP""). Reserva de sala (`/admin/room-bookings`, entidade "Reserva de sala", feminino; alvo = título): "Criou uma reserva de sala", "Editou/Excluiu a reserva de sala "Título""; `DELETE ?scope=future` vira "… e as próximas da série" (o hook guarda o `?scope=future` no caminho gravado só nessa rota). Rota nova com ação diferente de criar/editar/excluir → acrescentar em `SPECIAL`; entidade nova → `AUDIT_ENTITY_NOUNS` e a lista do filtro no painel. A planilha `audit-logs` usa a mesma frase (sem o nome) na coluna "Ação".

### Regras
| Método | Path | Use Case | Autenticação |
|--------|------|----------|--------------|
| `GET` | `/admin/rules` | `ListRulesUseCase` | `READ_RULE` |
| `POST` | `/rules` | `CreateRuleUseCase` | `CREATE_RULE` |
| `PATCH` | `/rules/:ruleId` | `UpdateRuleUseCase` | `UPDATE_RULE` |

### Notificações (`notification-router.ts`, use cases em `usecase/notifications.ts`)
| Método | Path | Use Case | Autenticação |
|--------|------|----------|--------------|
| `GET` | `/admin/notifications` | `ListNotificationsUseCase` → `{ unreadCount, pendingCount, events: [{ id, type, title, body, link, createdAt, read }], pending: [{ type, title, body, count, link, severity }] }` | JWT (qualquer admin) |
| `PATCH` | `/admin/notifications/read` | `MarkNotificationsReadUseCase` — `{ ids?: string[] }` (sem `ids` = todos os visíveis não lidos; `[]` = nenhum) → `{ updated }` (quantos foram marcados agora) | JWT (qualquer admin) |

- **Eventos** (gravados em `Notification`): só ações públicas/self-service, publicadas pelo port `NotificationPublisher` (`createNotificationPublisher`, `adapter/database/notification-adapter.ts`); tipos, títulos e links em `lib/notification-events.ts`. Publicar nunca derruba a ação (o adapter e `publishSafely` capturam e logam o erro).
  - `COURSE_REGISTRATION` (`READ_COURSE`): os três `register-for-course*` — "Nova inscrição em {curso}", corpo = nome da pessoa, link `/admin/cursos?curso={id}&aba=inscricoes`, entityId = inscrição. No `register-full`, publica depois do commit.
  - `CONTACT_MESSAGE` (`READ_CONTACT`): "Nova mensagem de {nome}", corpo = assunto ou null, link `/admin/mensagens`.
  - `INVITE_ACCEPTED` (`READ_USER_ADMIN`): "{pessoa} ativou o acesso ao painel", link `/admin/usuarios?tab=admins`.
  - Inscrição/cadastro feitos pela equipe no painel **não** geram evento.
- **Visibilidade**: o admin só vê eventos cuja `permission` está na sua regra; janela de 30 dias, mais recentes primeiro, até 50. `unreadCount` = não lidos na janela. Leitura é por admin (`NotificationRead`); marcar só afeta eventos visíveis.
- **Pendências** (`pending`): calculadas na hora por `computePendingNotifications` (`usecase/pending-notifications.ts` + `adapter/database/pending-notifications-adapter.ts`), nada gravado; `pendingCount` = tamanho da lista.
  - `ROOM_BOOKINGS_TODAY` (`READ_COURSE`, info): reservas de sala não excluídas que ocupam o dia de hoje em Brasília (mesma convenção de hora "de parede" dos cursos) → um item "Reservas de sala hoje", corpo "08:00 Título (Sala)" até 3 + "e mais N" (reserva que começou antes de hoje leva "DD/MM"), `count` = total, link `/admin/agenda`.
- **Retenção**: eventos com mais de 90 dias são apagados pelo publicador, no máximo uma vez por hora por processo (timestamp em memória). Leituras caem junto (cascade).
- `PATCH /admin/notifications/read` fica fora da auditoria (`skipAudit`).

### Dashboard
| Método | Path | Use Case | Autenticação |
|--------|------|----------|--------------|
| `GET` | `/admin/dashboard/stats` | `DashboardStatsUseCase` | `READ_COURSE` |

### Financeiro (`finance-router.ts`)
| Método | Path | Use Case | Autenticação |
|--------|------|----------|--------------|
| `GET` | `/admin/finance/transactions` | `ListFinanceTransactionsUseCase` — paginado + filtros (from, to, type, categoryId, accountId, `method`, search); `totals: { incomeCents, expenseCents }` soma todos os lançamentos filtrados (não só a página), sem transferências entre caixas nem "só nota" (mesma regra do `/admin/finance/summary`) | `READ_FINANCE` |
| `GET/POST/PATCH/DELETE` | `/admin/finance/recurrences[/:id]` | `finance-recurrences.ts` — molde do lançamento que se repete todo mês | `READ/CREATE/UPDATE/DELETE_FINANCE` |
| `POST` | `/admin/finance/recurrences/generate` | `GenerateFinanceRecurrencesUseCase` → `{ created }` | `CREATE_FINANCE` |
| `GET/POST/PATCH/DELETE` | `/admin/finance/payment-methods[/:id]` | `finance-payment-methods.ts` — lista de formas de pagamento | `READ/CREATE/UPDATE/DELETE_FINANCE` |
| `GET` | `/admin/finance/closings` · `/closings/preview?accountId&month` | `finance-closings.ts` — fechamentos e prévia do mês | `READ_FINANCE` |
| `POST/DELETE` | `/admin/finance/closings[/:id]` | fechar o mês / reabrir | `CREATE_FINANCE` / `DELETE_FINANCE` |

Demais rotas (categorias, caixas, lançamentos, transferências, comprovantes, export, summary) em `finance-router.ts`.

**Recorrentes** (`FinanceRecurringTransaction`): meses são texto `"AAAA-MM"` (`startMonth`,
`endMonth?`, `lastGeneratedMonth?`); `dayOfMonth` 1–31, e o mês mais curto usa o último dia
dele. A geração (chamada quando a tela do Financeiro abre) cria os lançamentos que faltam até
o mês atual e é **idempotente**: além do `lastGeneratedMonth`, o unique
`FinancialTransaction(recurringId, recurringMonth)` impede o mesmo mês duas vezes. Excluir a
recorrência é soft-delete do molde — os lançamentos já gerados ficam no caixa. Teto de 120
meses por rodada.

**Formas de pagamento** (`FinancePaymentMethod`): `FinancialTransaction.method` continua texto
livre (histórico); esta é a lista que o painel oferece. Nome gravado em caixa alta, único; o
filtro `method` da listagem/CSV compara sem diferenciar maiúsculas.

**Fechamento mensal** (`FinanceMonthlyClosing`, único por `accountId` + `month`): saldo
esperado = abertura (tudo antes do mês) + entradas − saídas do caixa, sempre **recalculado no
servidor**; `differenceCents` = contado − esperado. `DELETE` reabre o mês sem tocar nos
lançamentos.

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
| `GET /admin/users` | `search` (nome/email sem diferenciar acento e maiúscula; CPF e telefone com ou sem máscara — telefone procura em `phone`/`phone2`/`phone3`, pelos dígitos e pelo termo digitado, a partir de 3 dígitos), `memberType`, `memberClassification`, `gender`, `ethnicity`, `educationLevel` |
| `GET /admin/users/admins` | `search` (username) |
| `GET /admin/courses` | `status` (PUBLIC/PRIVATE/UNPUBLISHED/IN_PROGRESS/COMPLETED), `search` (nome) |
| `GET /admin/news` | `status` (PUBLISHED = já no ar / SCHEDULED = agendada para depois / UNPUBLISHED = rascunho), `search` (título) |

## Adaptadores de banco disponíveis

| Adapter | Arquivo | Port implementado |
|---------|---------|-------------------|
| `createUserDataAdapter` | `adapter/database/user-data.ts` | `UserDataRepository` |
| `createUserMergeAdapter` | `adapter/database/user-merge-adapter.ts` | `UserMergeRepository` |
| `createUserAdminAdapter` | `adapter/database/user-admin-adapter.ts` | `UserAdminRepository` |
| `createCourseAdapter` | `adapter/database/course-adapter.ts` | `CourseRepository` |
| `createRuleAdapter` | `adapter/database/rule-adapter.ts` | `RuleRepository` |
| `createNewsAdapter` | `adapter/database/news-adapter.ts` | `NewsRepository` |
| `createRoomAdapter` | `adapter/database/room-adapter.ts` | `RoomRepository` |
| `createRoomBookingAdapter` | `adapter/database/room-booking-adapter.ts` | `RoomBookingRepository` |
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
| `createNotificationAdapter` · `createNotificationPublisher` | `adapter/database/notification-adapter.ts` | `NotificationRepository` · `NotificationPublisher` |
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
| `business-rule.ts` | `BusinessRuleError` | `RoomAlreadyBookedError` (a mensagem diz o que ocupa a sala), `RegistrationsUnavailableError` |
| `conflict.ts` | `ConflictError` | `CpfAlreadyInUseError`, `UsernameAlreadyExistsError`, `AdminAccountAlreadyExistsError`, `CourseRegistrationAlreadyExistsError`, `InstructorAlreadyExistsError`, `InstructorAlreadyAssignedError`, `RoomHasCoursesError`, `RoomHasBookingsError`, `MergeDifferentCpfError`, `MergeBothHaveLoginError` |
| `not-found.ts` | `NotFoundError` | `CourseNotFoundError`, `UserNotFoundError`, `UserDataNotFoundError`, `AdminNotFoundError`, `NewsNotFoundError`, `RoomNotFoundError`, `RuleNotFoundError`, `RoleNotFoundError`, `PermissionRuleNotFoundError`, `RegistrationNotFoundError`, `PhotoNotFoundError`, `UserRelationNotFoundError`, `PropertyNotFoundError`, `AddressNotFoundError`, `InstructorNotFoundError`, `ContactMessageNotFoundError`, `BannerNotFoundError`, `RoomBookingNotFoundError` |
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
- As buscas por CPF/RG no `UserDataAdapter` filtram `isDeleted: false` — soft-deleted users não retornam em conflict checks. Não há busca por e-mail/telefone: não identificam a pessoa (podem repetir)
- **Busca sem acento** (`list-filters.ts`, pessoas/empresas/Unimed/admins e as exportações): "joao" acha "João" e vice-versa. Os nomes são comparados nas colunas `UserData.nameSearch`, `Company.nameSearch`/`tradeNameSearch` com `searchKey(termo)` (minúsculo, sem acento). Essas colunas são preenchidas por trigger (`*_fill_search`, função SQL `immutable_unaccent_lower`, migração `20260919100000_search_normalized`) — a aplicação nunca grava nelas; trigger em vez de coluna GENERATED para o `migrate dev` não acusar diferença. CPF/CNPJ só entram na busca quando o termo parece documento (só números e pontuação: `.`, `-`, `/`, `( )`, `+`), comparando os dígitos. **Telefone** entra com a mesma regra, a partir de 3 dígitos, em `phone`/`phone2`/`phone3` (da pessoa e da empresa; no Unimed, pelos da pessoa): como cadastros antigos gravaram com máscara e os novos só com dígitos, procura pelos dois — `44999990001` e `(44) 99999-0001`.
