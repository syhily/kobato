import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'

import { DEFAULT_FONT_PATH, DATA_PATH } from '@/server/infra/env'

export const FONT_DIR = path.resolve(DATA_PATH, 'fonts')
export const ANALYTICS_DEAD_LETTER_PATH = path.resolve(DATA_PATH, 'analytics', 'dead-letter.jsonl')
export const AUDIT_DEAD_LETTER_PATH = path.resolve(DATA_PATH, 'audit', 'dead-letter.jsonl')
export const MAXMIND_DB_PATH = path.resolve(DATA_PATH, 'maxmind', 'GeoLite2-City.mmdb')
// Local storage backend root. When S3 is not enabled, uploaded images,
// music, branding, and backups land here under the same key namespace
// the S3 backend uses (e.g. `images/...`, `musics/...`, `backup/...`).
export const STORAGE_DIR = path.resolve(DATA_PATH, 'storage')

/**
 * Returns true when `target` resolves to a path inside `root`. Used to harden
 * derived paths (e.g. `MAXMIND_DB_PATH`) against a misconfigured `DATA_PATH`
 * that would point readers at files outside the data directory.
 */
export function isPathInside(target: string, root: string): boolean {
  const relative = path.relative(root, target)
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
}

// Ensure subdirectories exist at startup so that dead-letter writers and
// upload endpoints don't fail on first write due to a missing parent dir.
for (const dir of [
  FONT_DIR,
  STORAGE_DIR,
  path.dirname(ANALYTICS_DEAD_LETTER_PATH),
  path.dirname(AUDIT_DEAD_LETTER_PATH),
  path.dirname(MAXMIND_DB_PATH),
]) {
  mkdirSync(dir, { recursive: true })
}

// Seed default Canvas fonts from the system package when the data directory
// is empty (e.g. bind-mounted). Skips if files already exist so user uploads
// are never overwritten.
function seedDefaultFonts(): void {
  if (!DEFAULT_FONT_PATH) {
    return
  }
  if (!existsSync(DEFAULT_FONT_PATH)) {
    return
  }

  const og = path.resolve(FONT_DIR, 'og.ttf')
  const calendar = path.resolve(FONT_DIR, 'calendar.ttf')

  if (!existsSync(og)) {
    try {
      copyFileSync(DEFAULT_FONT_PATH, og)
    } catch {
      // ignore
    }
  }
  if (!existsSync(calendar)) {
    try {
      copyFileSync(DEFAULT_FONT_PATH, calendar)
    } catch {
      // ignore
    }
  }
}

seedDefaultFonts()
