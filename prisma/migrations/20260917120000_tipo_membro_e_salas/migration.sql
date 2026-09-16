-- Tipo de membro vira lista fixa no painel:
--   ALUNO, PRODUTOR RURAL, TRABALHADOR RURAL ASSALARIADO, TRABALHADOR RURAL AUTONOMO.
-- O valor antigo "PRODUTOR" passa a ser "PRODUTOR RURAL". Outros valores antigos
-- ficam como estão (o painel mostra como "valor antigo" até alguém trocar).
UPDATE "UserData"
SET "memberType" = 'PRODUTOR RURAL'
WHERE upper(btrim("memberType")) = 'PRODUTOR';

-- Salas viram lista fixa: AUDITORIO, COZINHA, SALA DE VIDEO CONFERENCIA, SALA 1,
-- SALA 2, SALA APL. Normaliza os nomes já cadastrados (espaços sobrando e o antigo
-- "VIDEO CONFERENCIA").
UPDATE "room"
SET "name" = upper(btrim(regexp_replace("name", '\s+', ' ', 'g')));

UPDATE "room"
SET "name" = 'SALA DE VIDEO CONFERENCIA'
WHERE "name" IN ('VIDEO CONFERENCIA', 'VIDEOCONFERENCIA', 'SALA VIDEO CONFERENCIA', 'SALA DE VIDEOCONFERENCIA');
