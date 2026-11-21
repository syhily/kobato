import {
  OBSERVABILITY_DASHBOARD_FILES,
  SEA_OBSERVABILITY_DASHBOARD_PREFIX,
  SEA_OBSERVABILITY_RUM_PRIVACY_VRL_KEY,
} from '@kobato/distribution/sea-assets'
import { secretHmac } from '@kobato/server/infra/crypto/secret-encryption'
import { getLogger } from '@kobato/server/infra/logger'
import { readAssetTextOrDisk } from '@kobato/server/infra/sea/sea-asset'
import { RUM_PRIVACY_VRL_SHA256 } from '@kobato/telemetry/pipeline'
import { isRecord } from '@kobato/utils/type-guards'
import { createHash } from 'node:crypto'
import { join } from 'node:path'

const log = getLogger('observability.assets')

const ASSET_DIR = join(import.meta.dirname, 'assets')

const ASSET_FINGERPRINT_PURPOSE = 'observability-assets'
const ASSET_FINGERPRINT_VERSION = 1

export interface ObservabilityDashboardAsset {
  file: string
  raw: string
  body: Record<string, unknown>
}

export interface ObservabilityAssets {
  vrl: string
  dashboards: ObservabilityDashboardAsset[]
  fingerprint: string
}

let cached: ObservabilityAssets | undefined

function assetText(key: string, diskPath: string): string {
  const text = readAssetTextOrDisk(key, join(ASSET_DIR, diskPath))
  if (text === null) {
    throw new Error(`Observability asset missing: ${key}`)
  }
  return text
}

function readVrl(): string {
  return assetText(SEA_OBSERVABILITY_RUM_PRIVACY_VRL_KEY, 'rum-privacy.vrl').trim()
}

function readDashboards(): ObservabilityDashboardAsset[] {
  return OBSERVABILITY_DASHBOARD_FILES.map((file) => {
    const raw = assetText(`${SEA_OBSERVABILITY_DASHBOARD_PREFIX}${file}`, join('dashboards', file))
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch (error) {
      throw new Error(`Observability dashboard ${file} is not valid JSON`, { cause: error })
    }
    if (!isRecord(parsed)) {
      throw new Error(`Observability dashboard ${file} is not a JSON object`)
    }
    return { file, raw, body: parsed }
  })
}

export function observabilityAssetFingerprint(contents: readonly string[]): string {
  return secretHmac(ASSET_FINGERPRINT_PURPOSE, JSON.stringify({ version: ASSET_FINGERPRINT_VERSION, contents }))
}

export function getObservabilityAssets(): ObservabilityAssets {
  if (cached !== undefined) {
    return cached
  }
  const vrl = readVrl()
  const hash = createHash('sha256').update(vrl, 'utf8').digest('hex')
  if (hash !== RUM_PRIVACY_VRL_SHA256) {
    throw new Error('rum-privacy.vrl changed without updating RUM_PRIVACY_VRL_SHA256')
  }
  const dashboards = readDashboards()
  const fingerprint = observabilityAssetFingerprint([vrl, ...dashboards.map((dashboard) => dashboard.raw)])
  cached = { vrl, dashboards, fingerprint }
  log.debug('Loaded observability provisioning assets', { dashboards: dashboards.length })
  return cached
}

export function currentObservabilityAssetFingerprint(): string | null {
  try {
    return getObservabilityAssets().fingerprint
  } catch (error) {
    log.warn('Observability provisioning assets are unavailable', {
      error: error instanceof Error ? error.message : typeof error,
    })
    return null
  }
}

export function __resetObservabilityAssetsForTests(): void {
  cached = undefined
}
