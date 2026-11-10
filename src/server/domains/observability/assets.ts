// Bundled OpenObserve provisioning assets: the four versioned v8 dashboards and
// the fail-closed RUM privacy VRL. These are RAW (unpacked) SEA assets, so they
// are read through `readAssetTextOrDisk` — the VFS mount under SEA, the source
// tree otherwise — NEVER the packed `natives/*` blob channel. Main thread only:
// the VFS mount is invisible to worker threads. The content fingerprint is the
// HMAC stored as `provisionedFingerprint`; touching any asset makes every
// installation re-provision at boot.

import { createHash } from 'node:crypto'
import { join } from 'node:path'

import { secretHmac } from '@/server/infra/crypto/secret-encryption'
import { getLogger } from '@/server/infra/logger'
import { readAssetTextOrDisk } from '@/server/infra/sea-asset'
import { RUM_PRIVACY_VRL_SHA256 } from '@/shared/contracts/trace-pipeline'
import {
  OBSERVABILITY_DASHBOARD_FILES,
  SEA_OBSERVABILITY_DASHBOARD_PREFIX,
  SEA_OBSERVABILITY_RUM_PRIVACY_VRL_KEY,
} from '@/shared/sea/assets'
import { isRecord } from '@/shared/utils/type-guards'

const log = getLogger('observability.assets')

const ASSET_DIR = join(import.meta.dirname, 'assets')

/**
 * Asset-set fingerprint purpose, independent of the connection/runtime
 * purposes: rotating `security.encryptionKey` invalidates it, which simply
 * triggers one re-provision.
 */
const ASSET_FINGERPRINT_PURPOSE = 'observability-assets'
const ASSET_FINGERPRINT_VERSION = 1

export interface ObservabilityDashboardAsset {
  file: string
  /** Raw JSON text — part of the fingerprint payload, exactly as the asset ships. */
  raw: string
  body: Record<string, unknown>
}

export interface ObservabilityAssets {
  vrl: string
  dashboards: ObservabilityDashboardAsset[]
  /** HMAC over the VRL text plus every dashboard's raw JSON, in stable order. */
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

/** VRL text as installed into OpenObserve (trimmed; O2 appends its own sentinel). */
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

/**
 * Fingerprint of an asset payload. Pure (exported for tests): `contents` is the
 * VRL text followed by each dashboard's JSON in `OBSERVABILITY_DASHBOARD_FILES`
 * order. Keyed with the deployment key so the value is safe to expose to the
 * admin UI.
 */
export function observabilityAssetFingerprint(contents: readonly string[]): string {
  return secretHmac(ASSET_FINGERPRINT_PURPOSE, JSON.stringify({ version: ASSET_FINGERPRINT_VERSION, contents }))
}

/** Read (and memoize) the bundled assets. Throws when an asset is missing or malformed. */
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

/** The current asset fingerprint; null when the bundle cannot be read (logged, never thrown on the status path). */
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

/** Test seam: drop the memoized asset payload. */
export function __resetObservabilityAssetsForTests(): void {
  cached = undefined
}
