import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'sqlite',
  schema: ['./packages/db/src/schema/**/*.ts'],
  out: './packages/db/drizzle',
})
