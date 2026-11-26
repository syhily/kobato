import { TELEMETRY_EXCLUDED_RPC_PATHS } from '@kobato/api/rpc/telemetry'

export const SELF_TELEMETRY_PATHS: ReadonlySet<string> = new Set(['/health', '/ready', ...TELEMETRY_EXCLUDED_RPC_PATHS])

export function isSelfTelemetryPath(path: string): boolean {
  return SELF_TELEMETRY_PATHS.has(path)
}
