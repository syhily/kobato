import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'sqlite',
  schema: ['./packages/server/src/infra/db/schema/**/*.ts'],
  out: './drizzle',
})
