import { RUM_INTAKE_PATH } from '@kobato/api/contracts/public/observability'

export function createRumIntakeProxyUrl(options: { origin: string | null; path: string; parameters: string }): string {
  return `${options.origin ?? ''}${RUM_INTAKE_PATH}${options.path}?${options.parameters}`
}
