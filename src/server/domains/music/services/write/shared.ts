import { randomBytes } from 'node:crypto'

import type { Database } from '@/server/infra/db/database'
import type { SafeFetchFailure } from '@/server/infra/safe-fetch'

import { findMusicByPlayerId } from '@/server/infra/db/operations/music'
import { descriptorFor } from '@/server/infra/http/error-descriptor'
import { DomainError } from '@/server/infra/http/errors'
import { getLogger } from '@/server/infra/logger'
import { safeFetch } from '@/server/infra/safe-fetch'
import { redactUrlForLog } from '@/shared/utils/safe-url'

const log = getLogger('music.service')

// `[a-z0-9]{16}` ≈ 80 bits of entropy; collisions are retried anyway.
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

// Spoof a browser UA — providers blacklist Node's default for CDN downloads.
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
  throw new DomainError('INTERNAL', descriptorFor('music.error.playerIdConflict'))
}

// Map the safe-fetch failure union onto the pinned DomainError variants (codes/keys covered by the write tests).
function downloadError(result: SafeFetchFailure, originalUrl: string, what: 'audio' | 'cover'): DomainError {
  switch (result.reason) {
    case 'invalid-url':
      return new DomainError('BAD_REQUEST', descriptorFor('music.error.assetInvalidUrl', { asset: what }))
    case 'bad-protocol':
      return new DomainError('BAD_REQUEST', descriptorFor('music.error.assetBadProtocol', { asset: what }))
    case 'bad-port':
      return new DomainError('BAD_REQUEST', descriptorFor('music.error.assetBadPort', { asset: what }))
    case 'blocked-host':
      return new DomainError('BAD_REQUEST', descriptorFor('music.error.assetBlockedHost', { asset: what }))
    case 'too-many-redirects':
      return new DomainError('BAD_REQUEST', descriptorFor('music.error.assetTooManyRedirects', { asset: what }))
    case 'too-large':
      return new DomainError('BAD_REQUEST', descriptorFor('music.error.assetTooLarge', { asset: what }))
    case 'http-error':
      log.error('Music asset fetch returned non-2xx', {
        url: redactUrlForLog(originalUrl),
        what,
        status: result.status,
      })
      return new DomainError(
        'INTERNAL',
        descriptorFor('music.error.downloadFailedStatus', { asset: what, status: result.status }),
      )
    case 'dns-failure':
      log.error('Music asset DNS resolution failed', { url: redactUrlForLog(result.url), what, error: result.error })
      return new DomainError('INTERNAL', descriptorFor('music.error.downloadFailed', { asset: what }))
    case 'timeout':
    case 'fetch-failed':
      log.error('Music asset fetch failed', { url: redactUrlForLog(result.url), what, error: result.error })
      return new DomainError('INTERNAL', descriptorFor('music.error.downloadFailed', { asset: what }))
    case 'missing-redirect-location':
    case 'redirect-vetoed':
      return new DomainError('INTERNAL', descriptorFor('music.error.downloadFailed', { asset: what }))
  }
}

export async function downloadBinary(url: string, maxBytes: number, what: 'audio' | 'cover'): Promise<Buffer> {
  const result = await safeFetch(url, {
    timeoutMs: 30_000,
    maxBytes,
    maxRedirects: 5,
    headers: { 'User-Agent': MUSIC_DOWNLOAD_UA },
    operation: 'music.asset',
  })
  if (!result.ok) {
    throw downloadError(result, url, what)
  }
  return Buffer.from(result.body)
}
