// Settings → infra runtime projection for the observability domain. The infra
// layer takes a fully composed OTLP credential and owns no business semantics;
// this module owns the mapping (site name → organization, admin credentials →
// Basic header) and the two fingerprints that gate activation and hot restarts.

import type { TraceRuntimeSettings } from '@/server/infra/trace/config'
import type { ObservabilitySettings } from '@/shared/config/types'

import { secretHmac } from '@/server/infra/crypto/secret-encryption'

export type ObservabilitySettingsSlice = ObservabilitySettings['observability']

/**
 * Bump when a fingerprinted field set changes: stored `verifiedFingerprint`
 * values then stop matching and the admin must re-test the connection.
 */
const FINGERPRINT_VERSION = 'obs2'
const FINGERPRINT_PURPOSE = 'observability'

/**
 * CONNECTION fingerprint: exactly the parameters a connection test proves
 * (endpoint / organization / username / password). `verifiedFingerprint` stores
 * it and activation compares against it, so enabling tracing, log export, or
 * browser RUM — or changing a sampling rate — must NOT invalidate an
 * already-verified connection.
 *
 * Keyed with the deployment key (HMAC) because the value is exposed to the
 * admin UI: a plain sha256 over the password would be offline-guessable.
 * Rotating `security.encryptionKey` therefore invalidates stored verifications,
 * and the admin re-tests.
 */
export function observabilityConnectionFingerprint(site: ObservabilitySettingsSlice): string {
  return fingerprint('connection', {
    endpoint: site.endpoint,
    organization: site.organization,
    username: site.username,
    password: site.password ?? '',
  })
}

/**
 * RUNTIME fingerprint: every setting that changes the server or browser
 * pipeline. Used only for restart detection, so flipping a switch after
 * verification restarts the providers without losing the verification.
 *
 * `enabled` is excluded (the master switch is a separate gate; toggling it back
 * on must not force a re-test), `rumClientToken` because it only affects the
 * browser bootstrap, which re-reads the settings on the next document, and
 * `retentionDays` because it is a data policy reconciled by `retention.ts`, not
 * a pipeline change — it must not restart the providers.
 */
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
      // `clientIdentity` changes both the relay behavior and the browser
      // bootstrap (consent gate), so it must hot-restart the runtime.
      clientIdentity: site.frontend.clientIdentity,
    },
  })
}

function fingerprint(scope: 'connection' | 'runtime', payload: Record<string, unknown>): string {
  return secretHmac(FINGERPRINT_PURPOSE, JSON.stringify({ version: FINGERPRINT_VERSION, scope, ...payload }))
}

/** `Basic base64(username:password)`, or `null` while either half is unset. */
export function basicAuthorizationHeader(username: string, password: string): string | null {
  if (username === '' || password === '') {
    return null
  }
  return `Basic ${Buffer.from(`${username}:${password}`, 'utf8').toString('base64')}`
}

/** Map the settings section onto the infra runtime input. */
export function toTraceRuntimeSettings(site: ObservabilitySettingsSlice): TraceRuntimeSettings {
  return {
    enabled: site.enabled,
    endpoint: site.endpoint,
    organization: site.organization,
    // Incomplete credentials stay empty so the resolver reports one invalid
    // field instead of composing a header out of half a pair.
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
