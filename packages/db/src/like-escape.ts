import type { SQL, SQLWrapper } from 'drizzle-orm'

import { sql } from 'drizzle-orm'

/** Escapes LIKE wildcard characters (`%`, `_`) and the escape character (`\`) so user input is treated as literal text. */
export function escapeLikePattern(input: string): string {
  return input.replace(/[%_\\]/g, '\\$&')
}

/** Case-insensitive substring match: escapes `%`, `_`, `\`, wraps in
 *  `%…%`, appends `ESCAPE '\\'` (Drizzle's `ilike()` lacks ESCAPE). */
export function likeEscape(column: SQLWrapper, raw: string): SQL {
  return sql`${column} LIKE ${`%${escapeLikePattern(raw)}%`} ESCAPE '\\'`
}
