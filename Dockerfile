FROM node:22-alpine AS builder
WORKDIR /app

COPY package*.json ./
COPY tsconfig.json tsconfig.build.json ./
COPY prisma.config.ts ./
COPY prisma ./prisma/

# --include=dev forces devDependencies (typescript, @types/*) even when the
# build runs with NODE_ENV=production (Coolify injects it), which npm would
# otherwise use to skip them and break the tsc build.
RUN npm ci --include=dev

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

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
