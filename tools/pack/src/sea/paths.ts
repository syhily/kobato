import { resolve } from 'node:path'

export const repoRoot = resolve(import.meta.dirname, '..', '..', '..', '..')

export const OBSERVABILITY_SOURCE_ASSETS_DIR = 'packages/server/src/domains/observability/assets'

export function observabilitySourceAssetsDir(): string {
  return resolve(repoRoot, OBSERVABILITY_SOURCE_ASSETS_DIR)
}

// Well-known sentinel fuse the Node runtime looks for; documented in
// https://nodejs.org/api/single-executable-applications.html
export const SEA_SENTINEL_FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2'

export function seaDistDir() {
  return resolve(repoRoot, 'dist-sea')
}

export function seaIntermediatesDir() {
  return resolve(seaDistDir(), 'intermediates')
}

export function seaServerBundlePath() {
  return resolve(seaIntermediatesDir(), 'server.mjs')
}

export function seaWorkerBundlePath() {
  return resolve(seaIntermediatesDir(), 'process-worker.mjs')
}

export function seaSmokeWorkerBundlePath() {
  return resolve(seaIntermediatesDir(), 'smoke-worker.mjs')
}

export function seaManifestPath() {
  return resolve(seaIntermediatesDir(), 'manifest.json')
}

export function seaPackedAssetsDir() {
  return resolve(seaIntermediatesDir(), 'packed')
}

export function seaStagedNativesDir() {
  return resolve(seaIntermediatesDir(), 'staged-natives')
}

export function seaConfigPath() {
  return resolve(seaIntermediatesDir(), 'sea-config.json')
}

export function seaBinaryPath() {
  return resolve(seaDistDir(), seaBinaryFileName())
}

/** Windows refuses to execute a binary without the .exe extension. */
export function seaBinaryFileName() {
  return process.platform === 'win32' ? 'kobato.exe' : 'kobato'
}

export function seaBinarySha256Path() {
  return resolve(seaDistDir(), 'kobato.sha256')
}
