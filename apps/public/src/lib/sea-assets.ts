// SEA (Single Executable Application) asset reader — the frontend's
// environment half of the embedded-asset read. The pure reader (codec
// registry parse + lazy decompression) lives in
// `@kobato/shared/sea/reader` (the single owner of the decode contract);
// this module owns only the `node:sea` probe and the disk fallback.
//
// The frontend single-executable binary embeds its `build/client` tree as
// SEA assets (keys `client/...`, compressed per `scripts/sea/assets.ts`),
// exactly like the core binary. The frontend must read them back for static
// asset serving and the warmup manifests, but it cannot import the server
// package (headless boundary) — so the probe half is duplicated here,
// keeping the same `manifest.json` codec-registry contract. The key
// ownership stays with `@kobato/shared/sea/assets` (the single
// writer/reader key contract).
//
// Every function here is a no-op / pass-through outside SEA mode, so the
// dev server, `node apps/public/build/server/index.js`, and vitest behave
// exactly as before.

import { createEmbeddedAssetReader } from '@kobato/shared/sea/reader'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

interface NodeSeaModule {
  isSea(): boolean
  getAsset(key: string): ArrayBuffer
  getAssetKeys(): string[]
}

const nodeRequire = createRequire(import.meta.url)

let activeSea: NodeSeaModule | null | undefined

function isNodeSeaModule(value: unknown): value is NodeSeaModule {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  return (
    'isSea' in value &&
    typeof value.isSea === 'function' &&
    'getAsset' in value &&
    typeof value.getAsset === 'function' &&
    'getAssetKeys' in value &&
    typeof value.getAssetKeys === 'function'
  )
}

function getSea(): NodeSeaModule | null {
  if (activeSea === undefined) {
    let mod: NodeSeaModule | null = null
    try {
      const required: unknown = nodeRequire('node:sea')
      if (isNodeSeaModule(required)) {
        mod = required
      }
    } catch {
      mod = null
    }
    activeSea = mod !== null && mod.isSea() ? mod : null
  }
  return activeSea
}

/** Whether the current process is a Node.js single executable. */
export function isSea(): boolean {
  return getSea() !== null
}

let activeReader: ((key: string) => Buffer | null) | undefined

/**
 * Read an embedded SEA asset by key (e.g. `client/assets/manifest-abc.js`),
 * transparently decompressing it when the manifest packs it with a codec.
 * Returns null when not running as a SEA or when the key is missing.
 */
export function getEmbeddedAsset(key: string): Buffer | null {
  const sea = getSea()
  if (sea === null) {
    return null
  }
  activeReader ??= createEmbeddedAssetReader(sea)
  return activeReader(key)
}

/** List embedded SEA asset keys matching `prefix` (e.g. `client/assets/`). */
export function listEmbeddedAssetKeys(prefix: string): string[] {
  const sea = getSea()
  if (sea === null) {
    return []
  }
  return sea.getAssetKeys().filter((key) => key.startsWith(prefix))
}

/**
 * Read a text asset as UTF-8: the embedded SEA asset `key` when running as
 * a single executable, otherwise the file at `diskPath`. Returns null when
 * the asset or file is missing so callers can fall back.
 */
export function readAssetTextOrDisk(key: string, diskPath: string): string | null {
  if (isSea()) {
    return getEmbeddedAsset(key)?.toString('utf-8') ?? null
  }
  try {
    return readFileSync(diskPath, 'utf-8')
  } catch {
    return null
  }
}
