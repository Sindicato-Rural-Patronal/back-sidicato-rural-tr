# Histórico do backend

O que mudou e por quê. As regras que valem hoje estão no `CLAUDE.md`. Este arquivo serve para entender de onde veio uma regra ou um dado estranho no banco. As entradas mais novas ficam no topo.

## 19/10/2026: SR-025

- **Consulta e inscrição por CPF confirmam o telefone (SR-025).**
  - `GET /users/lookup-cpf/:cpf` dizia, para qualquer CPF, se havia cadastro e o primeiro nome. Filiação a sindicato é dado sensível na LGPD (art. 5º, II), e o CPF ia na URL, para os logs da API e do proxy.
  - `register-by-cpf` respondia 404 para CPF sem cadastro (a mesma pergunta por outro caminho) e inscrevia qualquer pessoa para quem soubesse o CPF dela. `register-full` com CPF já cadastrado vinculava a inscrição só pelo CPF.
  - Pediu-se o final do telefone, e não a data de nascimento, porque todo cadastro tem telefone e muitos não têm nascimento (decisão 001 da Arquitetura).
  - Os 4 dígitos sozinhos se adivinham trocando de IP: daí o limite de 5 erros por hora por CPF, que conta também CPF sem cadastro.
  - Quem trocou de telefone e não avisou o Sindicato não se inscreve mais pelo site com o CPF que já tem cadastro: a mensagem manda procurar o Sindicato.

## 16/10/2026: SR-006, SR-007, SR-012, SR-016 e SR-022

- **Rotas abertas demais (SR-006).**
  - `POST /users` era pública, mas só o painel a usa. Qualquer pessoa podia "ocupar" o CPF de alguém.
  - A ficha de inscrição em PDF baixava só com login.
  - A exportação `cadastros` pedia só `READ_USER_ADMIN`.
  - Inscrição, consulta por CPF e contato só tinham o limite global de 600/min.
  - O upload de notícia gravava o arquivo cru, com o MIME do cliente, num bucket público.
  - O link do botão do banner aceitava `javascript:`.
- **Escalonamento entre admins (SR-007).**
  - O anti-escalonamento só olhava a regra nova. Quem tinha `UPDATE_USER_ADMIN` trocava a senha do super admin e quem tinha `UPDATE_RULE` esvaziava a `SUPER_RULE`.
  - `DELETE /users/:id` derrubava o login de qualquer admin sem passar pelas travas.
  - O cadastro de admin aceitava senha vazia.
  - `PATCH /admin/me` trocava a senha sem pedir a atual.
- **Schema × migrations (SR-022).** Três colunas tinham `DEFAULT` no banco e não no schema: `updatedAt` de `FinancePaymentMethod` e de `FinanceRecurringTransaction`, e `cadPro`. O passo novo do CI acusava a diferença. O `globalSetup` do E2E relia o `.env.test` com `override` e aplicava as migrations sempre no `sindicato_e2e`.
- **Cursos e notícias (SR-016).**
  - `GET /courses` vinha por início crescente: com 9 cursos antigos ainda públicos, a home só mostrava passados.
  - Curso aceitava término antes do início. O conflito de sala do curso era conferido fora da trava das reservas.
  - Inscrição concorrente: o conflito de serialização do driver adapter (`DriverAdapterError` sem `code`) não era reconhecido, e a nova tentativa nunca rodava (achado do chat de Testes). Passou a valer a trava por curso (`lockCourseSeats`).
  - `publishedAt` da notícia gravava o instante real em UTC quando "publicada agora". "Publicar agora" uma agendada mantinha a data futura. As notícias antigas **não** foram migradas, porque não dá para separar o "agora" das datas vindas do painel.
- **Documentação (SR-012).** O `CLAUDE.md` foi reescrito a partir do código e o histórico veio para cá. O `README` foi enxugado. O seed local passou a dar todas as permissões do enum.

## Setembro/2026

- **Busca sem acento** (`20260919100000_search_normalized`): colunas `nameSearch`/`tradeNameSearch` preenchidas por trigger. Usamos trigger em vez de coluna GENERATED para o `migrate dev` não acusar diferença. Em `20260929120000_course_booking_search` entraram o título do curso e o da reserva: eles aparecem no site, o painel deixou de forçar maiúscula sem acento neles e passaram a precisar da coluna normalizada para a busca.
- **Erro do banco virava "não encontrado".** Os adapters tinham `catch { return null }` mudo. Banco fora do ar e chave estrangeira violada viravam "curso não encontrado", sem log. Daí o `semRegistro` (`adapter/database/prisma-errors.ts`).
- **Instrutor era removido com DELETE de verdade.** `CourseInstructor.instructorId` é FK obrigatória sem cascade. Quem já tinha dado curso não podia ser removido, o erro morria num `catch` mudo e a rota respondia 200. A tabela ganhou `isDeleted` (`20260929150000_user_instructor_soft_delete`); `promote` faz upsert e `demote` reporta falha.
- **Sala com soft-delete** (`20260929090000_room_soft_delete`). A FK `course.roomId` é obrigatória e sem cascade, então qualquer curso antigo, mesmo excluído, prendia a sala para sempre. Agora só segura a sala o que ainda vai acontecer nela. O nome é único entre as ativas, por índice parcial.
- **Usuário de admin único entre os ativos** (`20260929091000_admin_username_active_unique`). Excluir um admin libera o usuário dele.
- **Convênio sem soft-delete** (`20260929140000_convenio_sem_soft_delete`). As colunas nunca existiram no banco. A primeira versão da migração quebrou o deploy de 29/09.
- **Soft-delete em todo o app.** Excluir uma pessoa não levava junto login, inscrições, Unimed etc. A pessoa excluída continuava entrando no painel e ocupando vaga. Daí as duas regras de soft-delete do `CLAUDE.md`.
- **Inicialização automática removida** (`4dd5440`, 01/09). O `firstInitialize` criava a `SUPER_RULE`, o admin `admin/admin` e atualizava a regra com permissões novas. Desde então nada disso acontece sozinho: permissão nova chega às regras só por migration (como em `20260916120200_convenio_grant_and_seed_unimed` e `20260923110100_audit_retention_grant`).
- **Unimed com listas fixas** (`20260923120500_unimed_fixed_lists`). Só arrumou dados: maiúsculas quando o texto já era item da lista, e tirou a máscara do CNS quando sobravam 15 dígitos. Nada foi apagado. Registros legados com texto livre continuam salváveis.
- **Datas de banner** (`20260919120000_banner_dates_brasilia`). Somou 3 h às datas antigas gravadas como `00:00:00.000Z`/`23:59:59.999Z`, que são instantes e agora vêm do painel com `-03:00`.
- **Miniatura da capa do curso** (`20260919110000_course_cover_thumb`). Cursos antigos têm `bannerThumbUrl` null, e o front usa a capa no lugar.
- **E-mail e telefone podem repetir** (`20260920090000_userdata_contact_not_unique`). Casal e família dividem contato; a identidade é o CPF.
- **Empresa saiu da pessoa** (`20260917140000_public_contact_and_cleanup`). As colunas `cnpj`/`isPartner`/`partner*` de `UserData` foram removidas. CNPJ antigo e tipo de membro fora da lista (ex.: SOCIO) foram copiados para `memberNotes`. Empresa e parceria são `Company`.
- **CPF único entre ativos** (`20260914120000_userdata_cpf_unique_active`), por índice parcial.
- **CAD/PRO virou lista** (`20260911160000_cadpro_array`). O texto antigo foi para o primeiro item.
- **Endereço saiu da pessoa** (`20260622131433_remove_userdata_address_relation`). Hoje o endereço da pessoa é o de uma `Property` (a principal em `primaryPropertyId`).
