export const SELF_TELEMETRY_PATHS: ReadonlySet<string> = new Set(['/health', '/ready', '/api/rum/status'])

export const SELF_TELEMETRY_PATH_PREFIXES = ['/api/rum/intake/'] as const

export function isSelfTelemetryPath(path: string): boolean {
  return SELF_TELEMETRY_PATHS.has(path) || SELF_TELEMETRY_PATH_PREFIXES.some((prefix) => path.startsWith(prefix))
}
