import type { ObservabilitySettingsSlice } from '@kobato/server/domains/observability/config'
import type { O2Client } from '@kobato/server/domains/observability/o2-client'

import { getObservabilityAssets } from '@kobato/server/domains/observability/assets'
import { isObservabilityConnectionVerified } from '@kobato/server/domains/observability/connection'
import { throwO2Failure } from '@kobato/server/domains/observability/errors'
import { createO2Client, O2ClientError } from '@kobato/server/domains/observability/o2-client'
import { descriptorFor } from '@kobato/server/infra/http/error-descriptor'
import { DomainError } from '@kobato/server/infra/http/errors'
import { getLogger } from '@kobato/server/infra/logger'
import {
  RUM_PRIVACY_FUNCTION_NAME,
  RUM_PRIVACY_PIPELINE_DESCRIPTION,
  RUM_PRIVACY_PIPELINE_NAME,
  RUM_STREAM_NAME,
} from '@kobato/settings/telemetry/pipeline'

const log = getLogger('observability.provision')

export interface ObservabilitySettingsPatch {
  rumClientToken?: string
  provisionedFingerprint?: string
}

export type ObservabilitySettingsWriter = (patch: ObservabilitySettingsPatch) => Promise<void>

export type ProvisionStepStatus = 'created' | 'exists'

export interface ProvisionResult {
  organization: ProvisionStepStatus
  rumToken: ProvisionStepStatus
  pipeline: 'installed'
  dashboards: number
  provisionedFingerprint: string
}

export interface ProvisionDeps {
  client: O2Client
  organization: string
  currentRumToken: string
  persist: ObservabilitySettingsWriter
}

function installPrivacyPipeline(client: O2Client, organization: string, vrl: string): Promise<void> {
  return (async () => {
    await client.upsertFunction({ name: RUM_PRIVACY_FUNCTION_NAME, function: vrl, transType: 0 })
    await client.upsertPipeline({
      name: RUM_PRIVACY_PIPELINE_NAME,
      description: RUM_PRIVACY_PIPELINE_DESCRIPTION,
      enabled: true,
      source: {
        source_type: 'realtime',
        org_id: organization,
        stream_name: RUM_STREAM_NAME,
        stream_type: 'logs',
      },
      nodes: [
        {
          id: 'input',
          data: {
            node_type: 'stream',
            org_id: organization,
            stream_name: RUM_STREAM_NAME,
            stream_type: 'logs',
          },
          position: { x: 0, y: 0 },
          io_type: 'input',
        },
        {
          id: 'privacy',
          data: { node_type: 'function', name: RUM_PRIVACY_FUNCTION_NAME, after_flatten: true },
          position: { x: 240, y: 0 },
          io_type: 'default',
        },
        {
          id: 'output',
          data: {
            node_type: 'stream',
            org_id: organization,
            stream_name: RUM_STREAM_NAME,
            stream_type: 'logs',
          },
          position: { x: 480, y: 0 },
          io_type: 'output',
        },
      ],
      edges: [
        { id: 'einput-privacy', source: 'input', target: 'privacy' },
        { id: 'eprivacy-output', source: 'privacy', target: 'output' },
      ],
    })
  })()
}

async function ensureRumToken(
  client: O2Client,
  currentToken: string,
): Promise<{ status: 'created' | 'exists'; token: string }> {
  if (currentToken !== '') {
    const remote = await client.getRumToken()
    if (remote === currentToken) {
      return { status: 'exists', token: currentToken }
    }
  }
  const token = await client.createRumToken()
  return { status: 'created', token }
}

function assetFailure(error: unknown): never {
  log.warn('Observability provisioning assets could not be read', {
    error: error instanceof Error ? error.message : typeof error,
  })
  throw new DomainError('INTERNAL', descriptorFor('admin.settings.observability.error.assetsUnavailable'))
}

async function provisionInternal(deps: ProvisionDeps): Promise<ProvisionResult> {
  const { client, organization, persist } = deps
  try {
    const organizationStatus = await client.ensureOrganization()

    const token = await ensureRumToken(client, deps.currentRumToken)
    if (token.status === 'created') {
      await persist({ rumClientToken: token.token })
    }

    let assets: ReturnType<typeof getObservabilityAssets>
    try {
      assets = getObservabilityAssets()
    } catch (error) {
      assetFailure(error)
    }

    await installPrivacyPipeline(client, organization, assets.vrl)
    let dashboards = 0
    for (const dashboard of assets.dashboards) {
      await client.upsertDashboard(dashboard.body)
      dashboards += 1
    }

    await persist({ provisionedFingerprint: assets.fingerprint })

    return {
      organization: organizationStatus,
      rumToken: token.status,
      pipeline: 'installed',
      dashboards,
      provisionedFingerprint: assets.fingerprint,
    }
  } catch (error) {
    throwO2Failure(error, organization)
  }
}

let queue: Promise<unknown> = Promise.resolve()

export function runObservabilityProvisioning(deps: ProvisionDeps): Promise<ProvisionResult> {
  const task = queue.then(() => provisionInternal(deps))
  queue = task.catch(() => undefined)
  return task
}

export interface BootProvisionOptions {
  site: ObservabilitySettingsSlice | null
  writeSettings: ObservabilitySettingsWriter
}

export async function upgradeObservabilityProvisioningAtBoot(options: BootProvisionOptions): Promise<void> {
  const site = options.site
  if (site === null || !isObservabilityConnectionVerified(site)) {
    return
  }
  let fingerprint: string
  try {
    fingerprint = getObservabilityAssets().fingerprint
  } catch (error) {
    log.warn('Observability provisioning skipped: bundled assets are unreadable', {
      error: error instanceof Error ? error.message : typeof error,
    })
    return
  }
  if (site.provisionedFingerprint === fingerprint) {
    return
  }

  try {
    const client = createO2Client({
      endpoint: site.endpoint,
      organization: site.organization,
      username: site.username,
      password: site.password ?? '',
    })
    const result = await runObservabilityProvisioning({
      client,
      organization: site.organization,
      currentRumToken: site.rumClientToken ?? '',
      persist: options.writeSettings,
    })
    log.info('Observability assets provisioned', {
      organization: result.organization,
      rumToken: result.rumToken,
      dashboards: result.dashboards,
    })
  } catch (error) {
    if (error instanceof O2ClientError) {
      log.warn('Observability asset provisioning failed; telemetry continues with the previous assets', {
        kind: error.kind,
        operation: error.operation,
        status: error.status,
      })
      return
    }
    log.warn('Observability asset provisioning failed; telemetry continues with the previous assets', {
      error: error instanceof Error ? error.name : typeof error,
    })
  }
}
