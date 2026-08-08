// Single owner of the editor's datetime-local ↔ ISO contract: picker value
// is `YYYY-MM-DDTHH:mm`, wire is ISO. Empty AND unparseable input map to
// the no-value sentinel (`null` for parsers, `''` for formatters).

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}

function formatLocalInputValue(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Convert an ISO-8601 wire time into `YYYY-MM-DDTHH:mm`; `''` for invalid input. */
export function isoToLocalInputValue(iso: string): string {
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) {
    return ''
  }
  return formatLocalInputValue(new Date(ms))
}

/** Format a `Date` as a datetime-local input value. */
export function dateToLocalInputValue(date: Date): string {
  return formatLocalInputValue(date)
}

/** Parse a datetime-local value into a local-zone `Date`; `null` for empty / unparseable. */
export function parseLocalDateTimeInput(value: string): Date | null {
  if (value.trim() === '') {
    return null
  }
  const ms = Date.parse(value)
  if (Number.isNaN(ms)) {
    return null
  }
  return new Date(ms)
}

/** Parse a picker value into ISO; `null` is the no-value sentinel (empty AND unparseable). */
export function localInputValueToIso(localValue: string): string | null {
  if (localValue === '') {
    return null
  }
  const ms = Date.parse(localValue)
  if (Number.isNaN(ms)) {
    return null
  }
  return new Date(ms).toISOString()
}

/** Keep only future instants of the server's `publishedAt`; a past date is a fact, not a schedule — render blank. */
export function futureLocalInputValueOrEmpty(iso: string): string {
  const ms = Date.parse(iso)
  if (Number.isNaN(ms) || ms <= Date.now()) {
    return ''
  }
  return formatLocalInputValue(new Date(ms))
}
