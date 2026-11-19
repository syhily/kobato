// Connection gate + test-connection orchestrator for the observability section.
// The test uses the CURRENTLY SAVED settings only (the request-pinned bundle),
// never an unsaved draft: proving a credential the admin has not persisted would
// let a typo unlock a configuration that was never written.

import type { ObservabilitySettingsSlice } from '@kobato/server/domains/observability/config.ts'
import type { O2Client } from '@kobato/server/domains/observability/o2-client.ts'

import { observabilityConnectionFingerprint } from '@kobato/server/domains/observability/config.ts'
import { throwO2Failure } from '@kobato/server/domains/observability/errors.ts'
import { createO2Client } from '@kobato/server/domains/observability/o2-client.ts'
import { descriptorFor } from '@kobato/server/infra/http/error-descriptor.ts'
import { DomainError } from '@kobato/server/infra/http/errors.ts'
import {
  isSecureObservabilityOrigin,
  normalizeObservabilityOrigin,
  OBSERVABILITY_ORGANIZATION_PATTERN,
} from '@kobato/server/infra/observability.ts'

export interface ConnectionProbeResult {
  organization: 'created' | 'exists'
  version: string | null
}

let lastProbedVersion: string | null = null

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

export function assertObservabilityProvisionable(site: ObservabilitySettingsSlice): void {
  assertObservabilityConnectionConfig(site)
  if (site.verifiedFingerprint === '' || site.verifiedFingerprint !== observabilityConnectionFingerprint(site)) {
    throw new DomainError('BAD_REQUEST', descriptorFor('admin.settings.observability.error.notVerified'))
  }
}

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

export function __resetObservabilityConnectionForTests(): void {
  lastProbedVersion = null
}
