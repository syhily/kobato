import { randomBytes } from 'node:crypto'

import type { Database } from '@/server/infra/db/database'
import type { SafeFetchFailure } from '@/server/infra/safe-fetch'

import { findMusicByPlayerId } from '@/server/infra/db/operations/music'
import { DomainError } from '@/server/infra/http/errors'
import { getLogger } from '@/server/infra/logger'
import { safeFetch } from '@/server/infra/safe-fetch'

const log = getLogger('music.service')

// `[a-z0-9]{16}` is enough entropy for 80 bits — collisions are
// astronomically unlikely against the small music corpus, but we
// still retry on a unique-key violation just to be defensive.
const PLAYER_ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'
function generatePlayerId(): string {
  const bytes = randomBytes(16)
  let id = ''
  for (let i = 0; i < 16; i++) {
    id += PLAYER_ID_ALPHABET[bytes[i] % PLAYER_ID_ALPHABET.length]
  }
  return id
}
export const PLAYER_ID_RETRY_LIMIT = 5

export const MAX_AUDIO_BYTES = 25 * 1024 * 1024
export const MAX_COVER_BYTES = 5 * 1024 * 1024
export const COVER_SIZE = 300
export const COVER_JPEG_QUALITY = 85

// netease and friends often blacklist the default Node user agent for direct
// CDN downloads; spoof a stock browser UA so we land on the regular CDN path.
const MUSIC_DOWNLOAD_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'

export async function generateUniquePlayerId(db: Database): Promise<string> {
  for (let attempt = 0; attempt < PLAYER_ID_RETRY_LIMIT; attempt += 1) {
    const candidate = generatePlayerId()
    const collision = await findMusicByPlayerId(db, candidate)
    if (collision === null) {
      return candidate
    }
    log.warn('playerId collision; retrying', { candidate, attempt })
  }
  throw new DomainError('INTERNAL', 'playerId 生成失败：连续 5 次冲突')
}

// Map the safe-fetch failure union onto the pinned DomainError
// variants — the exact codes/messages are covered by the write tests.
function downloadError(result: SafeFetchFailure, originalUrl: string, what: 'audio' | 'cover'): DomainError {
  const asset = what === 'audio' ? '音频' : '封面'
  const action = what === 'audio' ? '下载音频' : '下载封面'
  switch (result.reason) {
    case 'invalid-url':
      return new DomainError('BAD_REQUEST', `${asset}地址无效`)
    case 'bad-protocol':
      return new DomainError('BAD_REQUEST', `${asset}地址协议不被支持`)
    case 'blocked-host':
      return new DomainError('BAD_REQUEST', `${asset}地址指向了内网或本机`)
    case 'too-many-redirects':
      return new DomainError('BAD_REQUEST', `${asset}地址重定向次数过多`)
    case 'too-large':
      return new DomainError('BAD_REQUEST', `${asset}体积超过上限`)
    case 'http-error':
      log.error('Music asset fetch returned non-2xx', { url: originalUrl, what, status: result.status })
      return new DomainError('INTERNAL', `${action}失败：${result.status}`)
    case 'timeout':
    case 'fetch-failed':
      log.error('Music asset fetch failed', { url: result.url, what, error: result.error })
      return new DomainError('INTERNAL', `${action}失败，请稍后再试`)
    case 'missing-redirect-location':
    case 'redirect-vetoed':
      return new DomainError('INTERNAL', `${action}失败，请稍后再试`)
  }
}

export async function downloadBinary(url: string, maxBytes: number, what: 'audio' | 'cover'): Promise<Buffer> {
  const result = await safeFetch(url, {
    timeoutMs: 30_000,
    maxBytes,
    maxRedirects: 5,
    headers: { 'User-Agent': MUSIC_DOWNLOAD_UA },
  })
  if (!result.ok) {
    throw downloadError(result, url, what)
  }
  return Buffer.from(result.body)
}
