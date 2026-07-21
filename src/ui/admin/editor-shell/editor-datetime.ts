// Single owner of the editor's datetime-local ↔ ISO contract. Three call
// sites used to carry their own copies (editor-shell-derived, both entity
// MetaSidebars, DateTimePicker); every conversion now routes through here:
//
//   wire ISO ──isoToLocalInputValue──▶ picker value (`YYYY-MM-DDTHH:mm`)
//   picker value ──localInputValueToIso──▶ wire ISO
//   picker value ──parseLocalDateTimeInput──▶ Date (picker internals)
//   Date ──dateToLocalInputValue──▶ picker value (picker commits)
//   wire ISO ──futureLocalInputValueOrEmpty──▶ picker value, future only
//
// The picker value has exactly two outcomes across the shell: a timestamp
// or "no value". Both `''` and unparseable input map to the no-value
// sentinel — `null` for the parsers, `''` for the formatters — and this
// module owns that decision.

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}

function formatLocalInputValue(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * Convert an ISO-8601 wire DTO timestamp into the `YYYY-MM-DDTHH:mm`
 * shape that `<input type="datetime-local">` expects. Returns `''`
 * for invalid inputs so the picker just renders blank.
 */
export function isoToLocalInputValue(iso: string): string {
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) {
    return ''
  }
  return formatLocalInputValue(new Date(ms))
}

/** Format a `Date` as a datetime-local input value (picker commits). */
export function dateToLocalInputValue(date: Date): string {
  return formatLocalInputValue(date)
}

/**
 * Parse a datetime-local input value into a `Date` in the local zone.
 * `null` for empty / unparseable input (the no-value sentinel).
 */
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

/**
 * Parse a local-tz picker value into an ISO-8601 wire timestamp.
 * `null` is the no-value sentinel: empty AND unparseable input both
 * map here so callers treat "cleared" and "garbage" identically.
 */
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

/**
 * Project the server's ISO `publishedAt` into the picker value, keeping
 * only future instants: a past (or unparseable) publishedAt is a fact,
 * not a schedule, so the picker renders blank instead.
 */
export function futureLocalInputValueOrEmpty(iso: string): string {
  const ms = Date.parse(iso)
  if (Number.isNaN(ms) || ms <= Date.now()) {
    return ''
  }
  return formatLocalInputValue(new Date(ms))
}
