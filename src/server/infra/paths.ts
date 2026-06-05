import path from 'node:path'

import { KOBATO_DATA_PATH } from '@/server/infra/env'

export const FONT_DIR = path.resolve(KOBATO_DATA_PATH, 'fonts')
export const ANALYTICS_DEAD_LETTER_PATH = path.resolve(KOBATO_DATA_PATH, 'analytics', 'dead-letter.jsonl')
export const AUDIT_DEAD_LETTER_PATH = path.resolve(KOBATO_DATA_PATH, 'audit', 'dead-letter.jsonl')
export const MAXMIND_DB_PATH = path.resolve(KOBATO_DATA_PATH, 'maxmind', 'GeoLite2-City.mmdb')
