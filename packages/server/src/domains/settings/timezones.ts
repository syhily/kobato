// Canonical IANA timezone list sourced from the runtime's own bundled
// tzdata via `Intl.supportedValuesOf('timeZone')` (ES2022, Node 18+).
// Centralised here so the list stays out of the client bundle and the
// CLDR lookup is paid once per process (a `Set` view gives O(1)
// membership checks). The runtime is deliberately the single source of
// truth — no npm `tzdata` — so the dropdown can never offer a zone the
// runtime would later reject.

const ZONES: readonly string[] = Object.freeze([...Intl.supportedValuesOf('timeZone')].sort())
const ZONE_SET: ReadonlySet<string> = new Set(ZONES)

export function getSupportedTimeZones(): readonly string[] {
  return ZONES
}

export function isSupportedTimeZone(value: string): boolean {
  return ZONE_SET.has(value)
}
