import { serverConfig } from '@kobato/server/infra/config.ts'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'

const { data: DATA_PATH, defaultFont: DEFAULT_FONT_PATH } = serverConfig.storage

export const FONT_DIR = path.resolve(DATA_PATH, 'fonts')
export const ANALYTICS_DEAD_LETTER_PATH = path.resolve(DATA_PATH, 'analytics', 'dead-letter.jsonl')
export const ANALYTICS_ENV_DEAD_LETTER_PATH = path.resolve(DATA_PATH, 'analytics', 'env-dead-letter.jsonl')
export const AUDIT_DEAD_LETTER_PATH = path.resolve(DATA_PATH, 'audit', 'dead-letter.jsonl')
export const MAXMIND_DB_PATH = path.resolve(DATA_PATH, 'maxmind', 'GeoLite2-City.mmdb')
export const MAXMIND_META_PATH = path.resolve(DATA_PATH, 'maxmind', 'GeoLite2-City.meta.json')
export const STORAGE_DIR = path.resolve(DATA_PATH, 'storage')

let storageDirForTests: string | null = null

export function __setStorageDirForTests(dir: string | null): void {
  storageDirForTests = dir
}

export function storageDir(): string {
  return storageDirForTests ?? STORAGE_DIR
}

export function isPathInside(target: string, root: string): boolean {
  const relative = path.relative(root, target)
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
}

for (const dir of [
  FONT_DIR,
  STORAGE_DIR,
  path.dirname(ANALYTICS_DEAD_LETTER_PATH),
  path.dirname(AUDIT_DEAD_LETTER_PATH),
  path.dirname(MAXMIND_DB_PATH),
]) {
  mkdirSync(dir, { recursive: true })
}

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
    } catch {}
  }
  if (!existsSync(calendar)) {
    try {
      copyFileSync(DEFAULT_FONT_PATH, calendar)
    } catch {}
  }
}

seedDefaultFonts()
