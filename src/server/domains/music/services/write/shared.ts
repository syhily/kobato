import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { randomBytes } from 'node:crypto'

import { findMusicByPlayerId } from '@/server/infra/db/operations/music'
import { DomainError } from '@/server/infra/http/errors'
import { getLogger } from '@/server/infra/logger'

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

export async function generateUniquePlayerId(db: NodePgDatabase): Promise<string> {
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

function assertDownloadableUrl(url: string, what: 'audio' | 'cover'): void {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new DomainError('BAD_REQUEST', `${what === 'audio' ? '音频' : '封面'}地址无效`)
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new DomainError('BAD_REQUEST', `${what === 'audio' ? '音频' : '封面'}地址协议不被支持`)
  }
  const host = parsed.hostname.toLowerCase()
  const blocked =
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host === '[::1]' ||
    host === '::1' ||
    host.endsWith('.localhost') ||
    host.startsWith('127.') ||
    host.startsWith('10.') ||
    host.startsWith('192.168.') ||
    host.startsWith('169.254.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
  if (blocked) {
    throw new DomainError('BAD_REQUEST', `${what === 'audio' ? '音频' : '封面'}地址指向了内网或本机`)
  }
}

export async function downloadBinary(url: string, maxBytes: number, what: 'audio' | 'cover'): Promise<Buffer> {
  assertDownloadableUrl(url, what)
  let response: Response
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(30_000),
      headers: {
        // netease and friends often blacklist the default Node user
        // agent for direct CDN downloads; spoof a stock browser UA so
        // we land on the regular CDN path.
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
      },
    })
  } catch (error) {
    log.error('Music asset fetch failed', { url, what, error })
    throw new DomainError('INTERNAL', `${what === 'audio' ? '下载音频' : '下载封面'}失败，请稍后再试`)
  }
  if (!response.ok) {
    log.error('Music asset fetch returned non-2xx', { url, what, status: response.status })
    throw new DomainError('INTERNAL', `${what === 'audio' ? '下载音频' : '下载封面'}失败：${response.status}`)
  }

  const length = response.headers.get('content-length')
  if (length !== null) {
    const expected = Number.parseInt(length, 10)
    if (Number.isFinite(expected) && expected > maxBytes) {
      throw new DomainError('BAD_REQUEST', `${what === 'audio' ? '音频' : '封面'}体积超过上限`)
    }
  }

  const arrayBuf = await response.arrayBuffer()
  if (arrayBuf.byteLength > maxBytes) {
    throw new DomainError('BAD_REQUEST', `${what === 'audio' ? '音频' : '封面'}体积超过上限`)
  }
  return Buffer.from(arrayBuf)
}
