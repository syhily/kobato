import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'

import { CANVAS_FALLBACK_FONT_PATH, KOBATO_DATA_PATH } from '@/server/infra/env'

export const FONT_DIR = path.resolve(KOBATO_DATA_PATH, 'fonts')
export const ANALYTICS_DEAD_LETTER_PATH = path.resolve(KOBATO_DATA_PATH, 'analytics', 'dead-letter.jsonl')
export const AUDIT_DEAD_LETTER_PATH = path.resolve(KOBATO_DATA_PATH, 'audit', 'dead-letter.jsonl')
export const MAXMIND_DB_PATH = path.resolve(KOBATO_DATA_PATH, 'maxmind', 'GeoLite2-City.mmdb')

// Ensure subdirectories exist at startup so that dead-letter writers and
// upload endpoints don't fail on first write due to a missing parent dir.
for (const dir of [
  FONT_DIR,
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
  if (!CANVAS_FALLBACK_FONT_PATH) {
    return
  }
  if (!existsSync(CANVAS_FALLBACK_FONT_PATH)) {
    return
  }

  const og = path.resolve(FONT_DIR, 'og.ttf')
  const calendar = path.resolve(FONT_DIR, 'calendar.ttf')

  if (!existsSync(og)) {
    try {
      copyFileSync(CANVAS_FALLBACK_FONT_PATH, og)
    } catch {
      // ignore
    }
  }
  if (!existsSync(calendar)) {
    try {
      copyFileSync(CANVAS_FALLBACK_FONT_PATH, calendar)
    } catch {
      // ignore
    }
  }
}

seedDefaultFonts()
