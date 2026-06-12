FROM node:20-alpine
WORKDIR /app

RUN apk add --no-cache libc6-compat openssl

# Copy everything
COPY . .

# Install all dependencies (including devDeps for prisma CLI + ts-node)
RUN npm install --legacy-peer-deps

# Generate Prisma client
RUN cd packages/db && npx prisma generate

# Build Next.js
ENV NEXT_TELEMETRY_DISABLED=1
RUN cd apps/web && npm run build

RUN chmod +x apps/web/docker-entrypoint.sh

EXPOSE 3000
ENV PORT=3000

CMD ["sh", "/app/apps/web/docker-entrypoint.sh"]
