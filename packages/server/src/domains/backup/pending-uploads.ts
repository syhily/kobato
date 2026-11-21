import { descriptorFor } from '@kobato/server/infra/http/error-descriptor'
import { ActionFailure } from '@kobato/server/infra/http/errors'
import { registerJob } from '@kobato/server/infra/job-registry'
import { getLogger } from '@kobato/server/infra/logger'
import { randomBytes } from 'node:crypto'
import { rmSync } from 'node:fs'

const log = getLogger('backup.pending-uploads')

const TTL_MS = 10 * 60 * 1000
const MAX_PENDING = 4

export interface PendingEncryptedUpload {
  token: string
  dir: string
  uploadPath: string
  fileName: string
  expiresAt: number
  inFlight: boolean
}

const pending = new Map<string, PendingEncryptedUpload>()

function sweepDir(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch (error) {
    log.warn('Failed to sweep pending upload dir', {
      dir,
      err: error instanceof Error ? error.message : String(error),
    })
  }
}

function dropEntry(token: string): void {
  const entry = pending.get(token)
  pending.delete(token)
  if (entry !== undefined) {
    sweepDir(entry.dir)
  }
}

function sweepExpired(): void {
  const now = Date.now()
  for (const [token, entry] of pending) {
    if (!entry.inFlight && entry.expiresAt <= now) {
      dropEntry(token)
      log.info('Expired pending encrypted upload swept', { fileName: entry.fileName })
    }
  }
}

export function parkEncryptedUpload(entry: { dir: string; uploadPath: string; fileName: string }): string {
  sweepExpired()
  while (pending.size >= MAX_PENDING) {
    let oldest: PendingEncryptedUpload | null = null
    for (const candidate of pending.values()) {
      if (candidate.inFlight) {
        continue
      }
      if (oldest === null || candidate.expiresAt < oldest.expiresAt) {
        oldest = candidate
      }
    }
    if (oldest === null) {
      throw new ActionFailure(429, descriptorFor('backup.error.decryptQueueFull'))
    }
    dropEntry(oldest.token)
    log.info('Pending encrypted upload evicted (cap reached)', { fileName: oldest.fileName })
  }
  const token = randomBytes(16).toString('hex')
  pending.set(token, { token, ...entry, expiresAt: Date.now() + TTL_MS, inFlight: false })
  return token
}

export function peekEncryptedUpload(token: string): PendingEncryptedUpload | null {
  const entry = pending.get(token)
  if (entry === undefined) {
    return null
  }
  if (entry.expiresAt <= Date.now()) {
    releaseEncryptedUpload(token)
    return null
  }
  return entry
}

export type DecryptClaim =
  | { ok: true; entry: PendingEncryptedUpload }
  | { ok: false; reason: 'missing' | 'expired' | 'in-flight' }

export function claimEncryptedUploadForDecrypt(token: string): DecryptClaim {
  const entry = pending.get(token)
  if (entry === undefined) {
    return { ok: false, reason: 'missing' }
  }
  if (entry.inFlight) {
    return { ok: false, reason: 'in-flight' }
  }
  if (entry.expiresAt <= Date.now()) {
    releaseEncryptedUpload(token)
    return { ok: false, reason: 'expired' }
  }
  entry.inFlight = true
  return { ok: true, entry }
}

export function endDecryptClaim(token: string): void {
  const entry = pending.get(token)
  if (entry !== undefined) {
    entry.inFlight = false
  }
}

export function releaseEncryptedUpload(token: string): void {
  dropEntry(token)
}

export function resetPendingEncryptedUploads(): void {
  for (const token of pending.keys()) {
    releaseEncryptedUpload(token)
  }
}

registerJob({
  name: 'backup.pending-upload-sweep',
  nextDelayMs: () => 60 * 1000,
  run: async () => {
    sweepExpired()
  },
})
