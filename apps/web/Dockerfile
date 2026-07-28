FROM node:22-alpine
WORKDIR /app

RUN apk add --no-cache libc6-compat openssl

# Install dependencies first — cached when package files don't change
COPY package.json package-lock.json ./
COPY packages/db/package.json packages/db/
COPY packages/types/package.json packages/types/
COPY packages/config/package.json packages/config/
COPY apps/web/package.json apps/web/
RUN npm install --legacy-peer-deps

# Copy source — invalidates the build layer, but deps remain cached
COPY . .

# Generate Prisma client
RUN cd packages/db && npx prisma generate

# Build Next.js
ENV NEXT_TELEMETRY_DISABLED=1
RUN cd apps/web && npm run build

RUN chmod +x apps/web/docker-entrypoint.sh

EXPOSE 3000
ENV PORT=3000

CMD ["sh", "/app/apps/web/docker-entrypoint.sh"]
