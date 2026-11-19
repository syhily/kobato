import type { ErrorMessageDescriptor } from '@kobato/contracts/api-error.ts'
import type { ObservabilityProvisionOutcome } from '@kobato/contracts/observability.ts'
import type { ObservabilitySettingsSlice } from '@kobato/server/domains/observability/config.ts'
import type { AuthedHandlerContext } from '@kobato/server/http/orpc-base.ts'

import { adminObservabilityContract } from '@kobato/api/admin/observability.ts'
import { recordAuditEventFromContext } from '@kobato/server/domains/audit/services/record.ts'
import { currentObservabilityAssetFingerprint } from '@kobato/server/domains/observability/assets.ts'
import { observabilityConnectionFingerprint } from '@kobato/server/domains/observability/config.ts'
import {
  assertObservabilityProvisionable,
  getLastProbedVersion,
  isObservabilityConnectionVerified,
  testObservabilityConnection,
} from '@kobato/server/domains/observability/connection.ts'
import { createO2Client } from '@kobato/server/domains/observability/o2-client.ts'
import { runObservabilityProvisioning } from '@kobato/server/domains/observability/provision.ts'
import {
  getObservabilityRuntimeStatus,
  syncObservabilityRuntime,
} from '@kobato/server/domains/observability/runtime-manager.ts'
import { updateBlogSettingsSection } from '@kobato/server/domains/settings/services/core.ts'
import { implementAdmin } from '@kobato/server/http/orpc-base.ts'
import { safeBigInt } from '@kobato/server/infra/coerce.ts'
import { carriesErrorMessageDescriptor, descriptorFor } from '@kobato/server/infra/http/error-descriptor.ts'
import { DomainError } from '@kobato/server/infra/http/errors.ts'

function readSavedSite(context: AuthedHandlerContext): ObservabilitySettingsSlice | null {
  return context.settings?.observability?.observability ?? null
}

function requireSavedSite(context: AuthedHandlerContext): ObservabilitySettingsSlice {
  const site = readSavedSite(context)
  if (site === null) {
    throw new DomainError(
      'BAD_REQUEST',
      descriptorFor('admin.settings.observability.error.incomplete', { field: 'endpoint' }),
    )
  }
  return site
}

function settingsWriter(context: AuthedHandlerContext) {
  const editorId = safeBigInt(context.viewer.id)
  return (patch: { rumClientToken?: string; provisionedFingerprint?: string; verifiedFingerprint?: string }) =>
    updateBlogSettingsSection(context.db, 'observability', { observability: patch }, editorId).then(() => undefined)
}

function provisionFailureDescriptor(error: unknown): ErrorMessageDescriptor {
  if (carriesErrorMessageDescriptor(error)) {
    return error.descriptor
  }
  return descriptorFor('admin.settings.observability.error.provisionFailed')
}

/**
 * Product chain: a verified connection immediately provisions the default O2
 * assets. A failure here is NOT a connection failure — the verified
 * fingerprint is already persisted — so the outcome is reported alongside
 * `ok: true` and the admin retries via `admin.observability.provision`.
 */
async function provisionAfterConnectionTest(
  context: AuthedHandlerContext,
  site: ObservabilitySettingsSlice,
): Promise<ObservabilityProvisionOutcome> {
  try {
    const result = await runObservabilityProvisioning({
      client: createO2Client({
        endpoint: site.endpoint,
        organization: site.organization,
        username: site.username,
        password: site.password ?? '',
      }),
      organization: site.organization,
      currentRumToken: site.rumClientToken ?? '',
      persist: settingsWriter(context),
    })
    return { status: 'succeeded', ...result }
  } catch (error) {
    return { status: 'failed', descriptor: provisionFailureDescriptor(error) }
  }
}

const impl = implementAdmin(adminObservabilityContract)

const testConnection = impl.testConnection.handler(async ({ context }) => {
  // Saved settings only: a connection test must never prove an unsaved draft.
  const site = requireSavedSite(context)
  const result = await testObservabilityConnection(site)

  // The CONNECTION fingerprint (endpoint/org/credentials only) unlocks
  // activation; flipping a sampling switch afterwards keeps it valid.
  const fingerprint = observabilityConnectionFingerprint(site)
  await settingsWriter(context)({ verifiedFingerprint: fingerprint })

  const provisionOutcome = await provisionAfterConnectionTest(context, site)

  recordAuditEventFromContext(context, {
    action: 'observability_connection_tested',
    resourceType: 'observability',
    resourceId: site.organization,
    details: {
      organizationCreated: result.organization === 'created',
      version: result.version,
      provision: provisionOutcome.status,
      ...(provisionOutcome.status === 'succeeded'
        ? { dashboards: provisionOutcome.dashboards, rumToken: provisionOutcome.rumToken }
        : { provisionError: provisionOutcome.descriptor.messageKey }),
    },
  })
  if (provisionOutcome.status === 'failed') {
    // The connection event stays the single success event; the failed asset
    // sync gets its own machine-readable record for diagnostics.
    recordAuditEventFromContext(context, {
      action: 'observability_provisioning_failed',
      resourceType: 'observability',
      resourceId: site.organization,
      details: { messageKey: provisionOutcome.descriptor.messageKey },
    })
  }

  await syncObservabilityRuntime()
  return {
    ok: true as const,
    version: result.version,
    organization: result.organization,
    provision: provisionOutcome,
  }
})

const provision = impl.provision.handler(async ({ context }) => {
  const site = requireSavedSite(context)
  assertObservabilityProvisionable(site)

  const result = await runObservabilityProvisioning({
    client: createO2Client({
      endpoint: site.endpoint,
      organization: site.organization,
      username: site.username,
      password: site.password ?? '',
    }),
    organization: site.organization,
    currentRumToken: site.rumClientToken ?? '',
    persist: settingsWriter(context),
  })

  recordAuditEventFromContext(context, {
    action: 'observability_assets_provisioned',
    resourceType: 'observability',
    resourceId: site.organization,
    details: {
      organization: result.organization,
      rumToken: result.rumToken,
      pipeline: result.pipeline,
      dashboards: result.dashboards,
      provisionedFingerprint: result.provisionedFingerprint,
    },
  })

  // The settings writes above already trigger the section handler; this is
  // an explicit convergence pass after provisioning completes.
  await syncObservabilityRuntime()
  return result
})

const status = impl.status.handler(({ context }) => {
  const site = readSavedSite(context)
  const currentAssets = currentObservabilityAssetFingerprint()
  const stored = site?.provisionedFingerprint ?? ''
  const runtime = getObservabilityRuntimeStatus()
  return {
    runtime: { phase: runtime.phase, lastError: runtime.lastError, lastExportError: runtime.lastExportError },
    verified: isObservabilityConnectionVerified(site),
    provisioned: stored !== '',
    provisionedCurrent: stored !== '' && currentAssets !== null && stored === currentAssets,
    version: getLastProbedVersion(),
  }
})

export const adminObservabilityRouter = impl.router({ testConnection, provision, status })
