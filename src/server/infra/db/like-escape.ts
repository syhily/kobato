import type { SQL, SQLWrapper } from 'drizzle-orm'

import { sql } from 'drizzle-orm'

import { escapeLikePattern } from '@/shared/utils/escape-like'

/** Case-insensitive substring match: escapes `%`, `_`, `\`, wraps in
 *  `%…%`, appends `ESCAPE '\\'` (Drizzle's `ilike()` lacks ESCAPE). */
export function likeEscape(column: SQLWrapper, raw: string): SQL {
  return sql`${column} LIKE ${`%${escapeLikePattern(raw)}%`} ESCAPE '\\'`
}
