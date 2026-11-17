import type { SQL, SQLWrapper } from 'drizzle-orm'

import { escapeLikePattern } from '@kobato/shared/utils/escape-like.ts'
import { sql } from 'drizzle-orm'

/** Case-insensitive substring match: escapes `%`, `_`, `\`, wraps in
 *  `%…%`, appends `ESCAPE '\\'` (Drizzle's `ilike()` lacks ESCAPE). */
export function likeEscape(column: SQLWrapper, raw: string): SQL {
  return sql`${column} LIKE ${`%${escapeLikePattern(raw)}%`} ESCAPE '\\'`
}
