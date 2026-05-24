// CSV escaping for PostgreSQL COPY streams. `null`/`undefined` becomes
// `\N` (Postgres COPY null representation); everything else is stringified
// and quoted iff it contains a comma, quote, newline, or carriage return.
// Embedded quotes are doubled. Returns a single un-terminated field —
// callers join with `,` and append `\n` to build a complete CSV row.
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
