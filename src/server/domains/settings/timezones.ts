// Canonical IANA zone list from `Intl.supportedValuesOf('timeZone')`. The runtime's
// own tzdata is the single source of truth — the dropdown can never offer a
// zone the runtime would reject.

const ZONES: readonly string[] = Object.freeze([...Intl.supportedValuesOf('timeZone')].sort())
const ZONE_SET: ReadonlySet<string> = new Set(ZONES)

export function getSupportedTimeZones(): readonly string[] {
  return ZONES
}

export function isSupportedTimeZone(value: string): boolean {
  return ZONE_SET.has(value)
}
