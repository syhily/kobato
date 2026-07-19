// Shared paths for the SEA (single executable) build pipeline.
//
// Layout under dist-sea/:
//   intermediates/main.cjs           tsdown output — SEA main (prelude)
//   intermediates/server.mjs         tsdown output — single-file ESM server
//   intermediates/process-worker.cjs tsdown output — embedded worker text
//   intermediates/smoke-worker.cjs   tsdown output — --smoke-worker entry
//   intermediates/manifest.json      embedded asset manifest (see assets.mjs)
//   intermediates/sea-config.json    node --experimental-sea-config input
//   intermediates/kobato.blob        generated SEA blob
//   kobato                           final single-executable binary
//   kobato.sha256                    sha256sum-format checksum file

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

export function seaMainBundlePath() {
  return resolve(seaIntermediatesDir(), 'main.cjs')
}

export function seaServerBundlePath() {
  return resolve(seaIntermediatesDir(), 'server.mjs')
}

export function seaWorkerBundlePath() {
  return resolve(seaIntermediatesDir(), 'process-worker.cjs')
}

export function seaSmokeWorkerBundlePath() {
  return resolve(seaIntermediatesDir(), 'smoke-worker.cjs')
}

export function seaManifestPath() {
  return resolve(seaIntermediatesDir(), 'manifest.json')
}

export function seaConfigPath() {
  return resolve(seaIntermediatesDir(), 'sea-config.json')
}

export function seaBlobPath() {
  return resolve(seaIntermediatesDir(), 'kobato.blob')
}

export function seaBinaryPath() {
  return resolve(seaDistDir(), 'kobato')
}

export function seaBinarySha256Path() {
  return resolve(seaDistDir(), 'kobato.sha256')
}
