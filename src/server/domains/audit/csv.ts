/**
 * Escape a value for CSV output (Postgres COPY format and standard CSV).
 * Null/undefined becomes `\N` (for COPY compatibility). Strings containing
 * commas, quotes, or newlines are wrapped in double-quotes with internal
 * quotes doubled.
 */
export function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return '\\N'
  }
  const str = typeof value === 'string' ? value : String(value)
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

/**
 * Characters that trigger Excel formula injection when they appear at
 * the start of a CSV cell. We prefix the value with a tab so Excel
 * treats the cell as plain text instead of evaluating it as a formula.
 */
const FORMULA_PREFIXES = new Set(['=', '+', '-', '@'])

/**
 * Escape a value for display-oriented CSV export (e.g. the admin
 * "export CSV" endpoint). Same as `csvEscape` but also defends against
 * CSV formula injection by prefixing cells that start with `=`, `+`,
 * `-`, or `@` with a tab character.
 *
 * Do NOT use this for PostgreSQL COPY streams — the tab prefix would
 * corrupt data in the database. Use `csvEscape` for COPY.
 */
export function csvEscapeDisplay(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return ''
  }
  const str = typeof value === 'string' ? value : String(value)
  const sanitized = str.length > 0 && FORMULA_PREFIXES.has(str[0]) ? `\t${str}` : str
  if (/[",\n\r]/.test(sanitized)) {
    return `"${sanitized.replace(/"/g, '""')}"`
  }
  return sanitized
}
