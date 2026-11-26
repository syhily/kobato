import { createRequire } from 'node:module'
import { isMainThread } from 'node:worker_threads'

interface NodeSeaModule {
  isSea(): boolean
}

const nodeRequire = createRequire(import.meta.url)

let activeSea: NodeSeaModule | null | undefined

function isNodeSeaModule(value: unknown): value is NodeSeaModule {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  return 'isSea' in value && typeof value.isSea === 'function'
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
    activeSea = mod?.isSea() ? mod : null
  }
  return activeSea
}

export function isSea(): boolean {
  return getSea() !== null
}

let vfsRoot: string | null | undefined

export function seaVfsRoot(): string | null {
  if (vfsRoot === undefined) {
    vfsRoot = isMainThread && getSea() !== null ? import.meta.dirname : null
  }
  return vfsRoot
}
