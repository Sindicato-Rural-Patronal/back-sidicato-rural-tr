FROM node:22-alpine AS builder
WORKDIR /app

COPY package*.json ./
COPY tsconfig.json ./
COPY prisma.config.ts ./
COPY prisma ./prisma/

RUN npm ci

RUN npx prisma generate

COPY src ./src/

RUN npm run build


FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
COPY prisma.config.ts ./
COPY prisma ./prisma/

RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist/

EXPOSE 3000

CMD ["sh", "-c", "echo \"[boot] DATABASE_URL set? ${DATABASE_URL:+yes}  SUPABASE_URL set? ${SUPABASE_URL:+yes}\"; npx prisma migrate deploy && node dist/index.js"]
