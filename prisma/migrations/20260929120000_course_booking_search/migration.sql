-- Busca sem acento para o título do curso e o da reserva.
--
-- Até agora o formulário do painel forçava MAIÚSCULA SEM ACENTO nesses dois
-- campos, e a busca (`contains` insensitive) funcionava só por causa disso.
-- Mas os dois aparecem no site público — o título do curso em /cursos, o da
-- reserva em /eventos —, e "MANEJO INTEGRADO DE PRAGAS NO MILHO" não é texto
-- que se mostre a visitante. Tirada a maiúscula, "manutencao" precisa achar
-- "Manutenção": daí as colunas de busca.
--
-- Mesmo desenho já usado em UserData/Company (migração
-- 20260919100000_search_normalized): coluna preenchida por trigger com
-- immutable_unaccent_lower(), que a aplicação nunca grava. Trigger em vez de
-- coluna GENERATED para o `migrate dev` não acusar diferença com o schema.
ALTER TABLE "course" ADD COLUMN IF NOT EXISTS "nameSearch" TEXT;
ALTER TABLE "RoomBooking" ADD COLUMN IF NOT EXISTS "titleSearch" TEXT;

CREATE OR REPLACE FUNCTION "course_fill_search"() RETURNS trigger
LANGUAGE plpgsql SET search_path FROM CURRENT
AS $$
BEGIN
    NEW."nameSearch" := immutable_unaccent_lower(NEW."name");
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "RoomBooking_fill_search"() RETURNS trigger
LANGUAGE plpgsql SET search_path FROM CURRENT
AS $$
BEGIN
    NEW."titleSearch" := immutable_unaccent_lower(NEW."title");
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "course_fill_search" ON "course";
CREATE TRIGGER "course_fill_search"
BEFORE INSERT OR UPDATE ON "course"
FOR EACH ROW EXECUTE FUNCTION "course_fill_search"();

DROP TRIGGER IF EXISTS "RoomBooking_fill_search" ON "RoomBooking";
CREATE TRIGGER "RoomBooking_fill_search"
BEFORE INSERT OR UPDATE ON "RoomBooking"
FOR EACH ROW EXECUTE FUNCTION "RoomBooking_fill_search"();

-- Preenche o que já existe.
UPDATE "course" SET "nameSearch" = immutable_unaccent_lower("name");
UPDATE "RoomBooking" SET "titleSearch" = immutable_unaccent_lower("title");
