// Closed set of HTTP paths that must not mint telemetry of their own.
//
// The health probes, the RUM drift poll (every open tab, every 10 s), and the
// intake relay (every RUM batch) are high-frequency self-telemetry endpoints:
// both the HTTP span/metric middleware and the OTLP log projection consult this
// single list, so a new endpoint of that kind is excluded from every signal by
// adding it here once.

export const SELF_TELEMETRY_PATHS: ReadonlySet<string> = new Set(['/health', '/ready', '/api/rum/status'])

// The RUM intake relay carries a variable sub-path (`/api/rum/intake/rum/v1/<org>/rum`).
export const SELF_TELEMETRY_PATH_PREFIXES = ['/api/rum/intake/'] as const

export function isSelfTelemetryPath(path: string): boolean {
  return SELF_TELEMETRY_PATHS.has(path) || SELF_TELEMETRY_PATH_PREFIXES.some((prefix) => path.startsWith(prefix))
}
