import { existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface WarmupManifest {
  version: number
  tier1: string[]
  tier2_public: string[]
  tier2_admin: string[]
  tier2_editor: string[]
  tier2_auth: string[]
}

let cached: WarmupManifest | null | undefined

export function getWarmupManifest(): WarmupManifest | null {
  if (cached !== undefined) {
    return cached
  }
  if (import.meta.env.DEV) {
    cached = null
    return null
  }

  try {
    const __dirname = dirname(fileURLToPath(import.meta.url))
    const manifestPath = join(__dirname, '..', '..', 'client', 'assets', 'warmup-manifest.json')

    if (!existsSync(manifestPath)) {
      cached = null
      return null
    }

    const raw = readFileSync(manifestPath, 'utf-8')
    cached = JSON.parse(raw) as WarmupManifest
    return cached
  } catch {
    cached = null
    return null
  }
}
