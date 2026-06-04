import type { SQL } from 'drizzle-orm'

import { sql } from 'drizzle-orm'

/** Escapes PostgreSQL LIKE / ILIKE wildcard characters (`%`, `_`) and the
 * escape character itself (`\`) so user input is treated as literal text. */
export function escapeLikePattern(input: string): string {
  return input.replace(/[%_\\]/g, '\\$&')
}

/** Safe ILIKE wrapper.
 *
 * 1. Escapes `%`, `_`, and `\` in `raw` so they are treated as literals.
 * 2. Wraps the escaped value in `%…%` for substring matching.
 * 3. Appends `ESCAPE '\\'` so PostgreSQL knows to use backslash as the
 *    escape character.
 *
 * This is a drop-in replacement for Drizzle's `ilike(column, pattern)`
 * which does not support the ESCAPE clause. */
export function ilikeEscape<T>(column: T, raw: string): SQL {
  return sql`${column} ILIKE ${`%${escapeLikePattern(raw)}%`} ESCAPE '\\'`
}
