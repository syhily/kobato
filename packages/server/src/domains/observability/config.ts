import type { TraceRuntimeSettings } from '@kobato/server/infra/trace/config.ts'
import type { ObservabilitySettings } from '@kobato/settings/types.ts'

import { secretHmac } from '@kobato/server/infra/crypto/secret-encryption.ts'

export type ObservabilitySettingsSlice = ObservabilitySettings['observability']

const FINGERPRINT_VERSION = 'obs2'
const FINGERPRINT_PURPOSE = 'observability'

export function observabilityConnectionFingerprint(site: ObservabilitySettingsSlice): string {
  return fingerprint('connection', {
    endpoint: site.endpoint,
    organization: site.organization,
    username: site.username,
    password: site.password ?? '',
  })
}

export function observabilityRuntimeFingerprint(site: ObservabilitySettingsSlice): string {
  return fingerprint('runtime', {
    endpoint: site.endpoint,
    organization: site.organization,
    username: site.username,
    password: site.password ?? '',
    sampleRate: site.sampleRate,
    includeRedactedSql: site.includeRedactedSql,
    logs: site.logs.enabled,
    frontend: {
      enabled: site.frontend.enabled,
      sessionSampleRate: site.frontend.sessionSampleRate,
      clientIdentity: site.frontend.clientIdentity,
    },
  })
}

function fingerprint(scope: 'connection' | 'runtime', payload: Record<string, unknown>): string {
  return secretHmac(FINGERPRINT_PURPOSE, JSON.stringify({ version: FINGERPRINT_VERSION, scope, ...payload }))
}

export function basicAuthorizationHeader(username: string, password: string): string | null {
  if (username === '' || password === '') {
    return null
  }
  return `Basic ${Buffer.from(`${username}:${password}`, 'utf8').toString('base64')}`
}

export function toTraceRuntimeSettings(site: ObservabilitySettingsSlice): TraceRuntimeSettings {
  return {
    enabled: site.enabled,
    endpoint: site.endpoint,
    organization: site.organization,
    authorizationHeader: basicAuthorizationHeader(site.username, site.password ?? '') ?? '',
    sampleRate: site.sampleRate,
    includeRedactedSql: site.includeRedactedSql,
    logs: { enabled: site.logs.enabled },
    frontend: {
      enabled: site.frontend.enabled,
      applicationId: site.organization,
      clientToken: site.rumClientToken ?? '',
      sessionSampleRate: site.frontend.sessionSampleRate,
      clientIdentity: site.frontend.clientIdentity,
    },
  }
}
