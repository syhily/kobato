import type { SQL, SQLWrapper } from 'drizzle-orm'

import { sql } from 'drizzle-orm'

export function escapeLikePattern(input: string): string {
  return input.replace(/[%_\\]/g, '\\$&')
}

export function likeEscape(column: SQLWrapper, raw: string): SQL {
  return sql`${column} LIKE ${`%${escapeLikePattern(raw)}%`} ESCAPE '\\'`
}
