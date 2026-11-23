import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  schema: ['./src/duckdb/schema.ts'],
  out: './drizzle/duckdb',
})
