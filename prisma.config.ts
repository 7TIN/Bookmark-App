import 'dotenv/config'
import { defineConfig } from 'prisma/config'

const prismaDatasourceUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL

if (!prismaDatasourceUrl) {
  throw new Error('Set DIRECT_URL or DATABASE_URL to run Prisma CLI commands.')
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Prefer direct (non-pooled) URL for CLI tasks; fall back to pooled URL when needed.
    url: prismaDatasourceUrl,
  },
})
