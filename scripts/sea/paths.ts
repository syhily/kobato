// Shared paths for the SEA (single executable) build pipeline.

import { resolve } from 'node:path'

export const repoRoot = resolve(import.meta.dirname, '..', '..')

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

/** Compressed asset payloads, laid out by asset key (`packed/<key>`). */
export function seaPackedAssetsDir() {
  return resolve(seaIntermediatesDir(), 'packed')
}

/** Staging area for the rpath-patched native libraries (never the node_modules originals). */
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
