import type { SQL } from 'drizzle-orm'

import { sql } from 'drizzle-orm'

import { escapeLikePattern } from '@/shared/utils/escape-like'

/** Safe case-insensitive substring match: escapes `%`, `_`, and `\`,
 *  wraps in `%…%`, and appends `ESCAPE '\\'`. SQLite's `LIKE` is
 *  case-insensitive for ASCII, which matches the old Postgres `ILIKE`
 *  semantics for the latin corpus; drop-in replacement for Drizzle's
 *  `ilike()` which lacks the ESCAPE clause. */
export function likeEscape<T>(column: T, raw: string): SQL {
  return sql`${column} LIKE ${`%${escapeLikePattern(raw)}%`} ESCAPE '\\'`
}
