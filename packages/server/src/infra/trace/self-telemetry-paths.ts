import { TELEMETRY_EXCLUDED_RPC_PATHS } from '@kobato/api/rpc/telemetry'

export const SELF_TELEMETRY_PATHS: ReadonlySet<string> = new Set(['/health', '/ready', ...TELEMETRY_EXCLUDED_RPC_PATHS])

export const SELF_TELEMETRY_PATH_PREFIXES = ['/api/rum/intake/'] as const

export function isSelfTelemetryPath(path: string): boolean {
  return SELF_TELEMETRY_PATHS.has(path) || SELF_TELEMETRY_PATH_PREFIXES.some((prefix) => path.startsWith(prefix))
}
