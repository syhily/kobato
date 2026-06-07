/** Escapes PostgreSQL LIKE / ILIKE wildcard characters (`%`, `_`) and the
 * escape character itself (`\`) so user input is treated as literal text. */
export function escapeLikePattern(input: string): string {
  return input.replace(/[%_\\]/g, '\\$&')
}
