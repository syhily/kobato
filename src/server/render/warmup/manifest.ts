import { existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { isRecord } from '@/shared/utils/type-guards'

export interface WarmupManifest {
  version: number
  tier1: string[]
  tier2_public: string[]
  tier2_admin: string[]
  tier2_editor: string[]
  tier2_auth: string[]
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isWarmupManifest(value: unknown): value is WarmupManifest {
  if (!isRecord(value)) {
    return false
  }
  return (
    typeof value.version === 'number' &&
    isStringArray(value.tier1) &&
    isStringArray(value.tier2_public) &&
    isStringArray(value.tier2_admin) &&
    isStringArray(value.tier2_editor) &&
    isStringArray(value.tier2_auth)
  )
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
    const parsed: unknown = JSON.parse(raw)
    if (!isWarmupManifest(parsed)) {
      cached = null
      return null
    }
    cached = parsed
    return cached
  } catch {
    cached = null
    return null
  }
}
