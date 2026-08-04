// Shared paths for the SEA (single executable) build pipeline.
//
// Layout under dist-sea/ (target-parameterized — see target.ts):
//   core (SEA_TARGET=core, the default):
//     intermediates/server.mjs         vite output — single-file ESM server
//                                      (the injected `main` of the binary)
//     intermediates/process-worker.mjs vite output — embedded worker text
//     intermediates/smoke-worker.mjs   vite output — --smoke-worker entry
//     intermediates/staged-natives/    patched native libraries (see assets.ts)
//     intermediates/packed/<key>       compressed asset payloads (see assets.ts)
//     intermediates/manifest.json      embedded asset manifest (see assets.ts)
//     intermediates/sea-config.json    sea config input (node --build-sea)
//     kobato(.exe)                     final single-executable binary
//     kobato.sha256                    sha256sum-format checksum file
//   frontend (SEA_TARGET=frontend): the same layout under
//     intermediates-frontend/, binary kobato-frontend(.exe) +
//     kobato-frontend.sha256 — no worker/smoke bundles, no staged
//     natives (the frontend line carries no native libraries).

import { resolve } from 'node:path'

import type { SeaTarget } from './target.ts'

export const repoRoot = resolve(import.meta.dirname, '..', '..')

// Well-known sentinel fuse the Node runtime looks for; documented in
// https://nodejs.org/api/single-executable-applications.html
export const SEA_SENTINEL_FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2'

export function seaDistDir() {
  return resolve(repoRoot, 'dist-sea')
}

/** Per-target intermediates dir — the two lines never share a dir (each build wipes its own). */
export function seaIntermediatesDir(target: SeaTarget = 'core') {
  return resolve(seaDistDir(), target === 'core' ? 'intermediates' : 'intermediates-frontend')
}

export function seaServerBundlePath(target: SeaTarget = 'core') {
  return resolve(seaIntermediatesDir(target), 'server.mjs')
}

export function seaWorkerBundlePath(target: SeaTarget = 'core') {
  return resolve(seaIntermediatesDir(target), 'process-worker.mjs')
}

export function seaSmokeWorkerBundlePath(target: SeaTarget = 'core') {
  return resolve(seaIntermediatesDir(target), 'smoke-worker.mjs')
}

export function seaManifestPath(target: SeaTarget = 'core') {
  return resolve(seaIntermediatesDir(target), 'manifest.json')
}

/** Compressed asset payloads, laid out by asset key (`packed/<key>`). */
export function seaPackedAssetsDir(target: SeaTarget = 'core') {
  return resolve(seaIntermediatesDir(target), 'packed')
}

/** Staging area for the rpath-patched native libraries (never the node_modules originals). */
export function seaStagedNativesDir(target: SeaTarget = 'core') {
  return resolve(seaIntermediatesDir(target), 'staged-natives')
}

export function seaConfigPath(target: SeaTarget = 'core') {
  return resolve(seaIntermediatesDir(target), 'sea-config.json')
}

export function seaBinaryPath(target: SeaTarget = 'core') {
  return resolve(seaDistDir(), seaBinaryFileName(target))
}

/** Windows refuses to execute a binary without the .exe extension. */
export function seaBinaryFileName(target: SeaTarget = 'core') {
  const base = target === 'core' ? 'kobato' : 'kobato-frontend'
  return process.platform === 'win32' ? `${base}.exe` : base
}

export function seaBinarySha256Path(target: SeaTarget = 'core') {
  return resolve(seaDistDir(), `${target === 'core' ? 'kobato' : 'kobato-frontend'}.sha256`)
}
