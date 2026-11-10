// Connection gate + test-connection orchestrator for the observability section.
// The test uses the CURRENTLY SAVED settings only (the request-pinned bundle),
// never an unsaved draft: proving a credential the admin has not persisted would
// let a typo unlock a configuration that was never written.

import type { ObservabilitySettingsSlice } from '@/server/domains/observability/config'
import type { O2Client } from '@/server/domains/observability/o2-client'

import { observabilityConnectionFingerprint } from '@/server/domains/observability/config'
import { throwO2Failure } from '@/server/domains/observability/errors'
import { createO2Client } from '@/server/domains/observability/o2-client'
import { descriptorFor } from '@/server/infra/http/error-descriptor'
import { DomainError } from '@/server/infra/http/errors'
import {
  isSecureObservabilityOrigin,
  normalizeObservabilityOrigin,
  OBSERVABILITY_ORGANIZATION_PATTERN,
} from '@/shared/config/observability'

export interface ConnectionProbeResult {
  organization: 'created' | 'exists'
  /** OpenObserve release version from the authenticated config endpoint. */
  version: string | null
}

let lastProbedVersion: string | null = null

/** Last version observed by a successful connection test in this process (null before any test). */
export function getLastProbedVersion(): string | null {
  return lastProbedVersion
}

function incomplete(field: 'endpoint' | 'organization' | 'username' | 'password'): never {
  throw new DomainError('BAD_REQUEST', descriptorFor('admin.settings.observability.error.incomplete', { field }))
}

/**
 * Validate the saved connection parameters with the SAME grammar the runtime
 * resolver enforces, throwing the actionable field descriptor instead of a
 * generic "invalid configuration".
 */
export function assertObservabilityConnectionConfig(site: ObservabilitySettingsSlice): void {
  if (site.endpoint.trim() === '') {
    incomplete('endpoint')
  }
  if (normalizeObservabilityOrigin(site.endpoint) === null) {
    throw new DomainError('BAD_REQUEST', descriptorFor('admin.settings.observability.error.endpointInvalid'))
  }
  if (!isSecureObservabilityOrigin(site.endpoint)) {
    throw new DomainError('BAD_REQUEST', descriptorFor('admin.settings.observability.error.endpointHttps'))
  }
  if (site.organization.trim() === '') {
    incomplete('organization')
  }
  if (!OBSERVABILITY_ORGANIZATION_PATTERN.test(site.organization)) {
    throw new DomainError('BAD_REQUEST', descriptorFor('admin.settings.observability.error.organizationInvalid'))
  }
  if (site.username.trim() === '') {
    incomplete('username')
  }
  if ((site.password ?? '') === '') {
    incomplete('password')
  }
}

/** True when the saved configuration is complete AND its connection fingerprint matches the last successful test. */
export function isObservabilityConnectionVerified(site: ObservabilitySettingsSlice | null): boolean {
  if (site === null) {
    return false
  }
  try {
    assertObservabilityConnectionConfig(site)
  } catch {
    return false
  }
  return site.verifiedFingerprint !== '' && site.verifiedFingerprint === observabilityConnectionFingerprint(site)
}

/** Provisioning prerequisite: a complete, verified connection. */
export function assertObservabilityProvisionable(site: ObservabilitySettingsSlice): void {
  assertObservabilityConnectionConfig(site)
  if (site.verifiedFingerprint === '' || site.verifiedFingerprint !== observabilityConnectionFingerprint(site)) {
    throw new DomainError('BAD_REQUEST', descriptorFor('admin.settings.observability.error.notVerified'))
  }
}

/**
 * healthz → authenticated org listing (proves the credentials) → ensure the
 * organization exists → version. `createClient` is injectable for unit tests.
 */
export async function testObservabilityConnection(
  site: ObservabilitySettingsSlice,
  createClient: typeof createO2Client = createO2Client,
): Promise<ConnectionProbeResult> {
  assertObservabilityConnectionConfig(site)

  let client: O2Client
  try {
    client = createClient({
      endpoint: site.endpoint,
      organization: site.organization,
      username: site.username,
      password: site.password ?? '',
    })
  } catch (error) {
    throwO2Failure(error, site.organization)
  }

  try {
    await client.health()
    // A lightweight authenticated call: a bad password fails here, before any
    // organization is created or asset is touched.
    await client.listOrganizations()
    const organization = await client.ensureOrganization()
    const version = await client.getVersion()
    lastProbedVersion = version
    return { organization, version }
  } catch (error) {
    throwO2Failure(error, site.organization)
  }
}

/** Test seam: forget the process-local last probed version. */
export function __resetObservabilityConnectionForTests(): void {
  lastProbedVersion = null
}
