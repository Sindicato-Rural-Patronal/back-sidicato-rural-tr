-- Miniatura da capa do curso (WebP ~640px) usada nos cards. Cursos existentes
-- ficam com NULL e os cards continuam usando a capa inteira até um novo envio.
ALTER TABLE "course" ADD COLUMN IF NOT EXISTS "bannerThumbUrl" TEXT;
