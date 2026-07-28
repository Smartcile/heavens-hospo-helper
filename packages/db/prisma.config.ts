import { defineConfig } from 'prisma/config'

if (!process.env.DATABASE_URL) {
  require('dotenv').config()
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL!,
  },
  seed: {
    tsNode: {
      command: 'tsx prisma/seed.ts',
    },
  },
})
