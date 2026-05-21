import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/server/infra/db/schema.ts',
  out: './drizzle',
})
