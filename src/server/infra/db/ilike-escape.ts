import type { SQL } from 'drizzle-orm'

import { sql } from 'drizzle-orm'

import { escapeLikePattern } from '@/shared/utils/escape-like'

/** Safe ILIKE wrapper: escapes `%`, `_`, and `\`, wraps in `%…%`,
 *  and appends `ESCAPE '\\'`. Drop-in replacement for Drizzle's
 *  `ilike()` which lacks the ESCAPE clause. */
export function ilikeEscape<T>(column: T, raw: string): SQL {
  return sql`${column} ILIKE ${`%${escapeLikePattern(raw)}%`} ESCAPE '\\'`
}
