import { randomBytes } from 'node:crypto'
import { rmSync } from 'node:fs'

import { descriptorFor } from '@/server/infra/http/error-descriptor'
import { ActionFailure } from '@/server/infra/http/errors'
import { registerJob } from '@/server/infra/job-registry'
import { getLogger } from '@/server/infra/logger'

/**
 * Encrypted uploads parked between the two restore calls: `upload-restore`
 * stages the raw bytes and parks the temp dir here; `upload-restore/decrypt`
 * resolves the entry by token. Dirs use RESTORE_TEMP_PREFIX so a crash leaves
 * them to the boot-time sweep.
 */

const log = getLogger('backup.pending-uploads')

const TTL_MS = 10 * 60 * 1000
/** Each parked upload can hold MAX_BACKUP_FILE_SIZE on the temp disk, so the
 *  count is capped; the earliest-expiring entry is evicted first. */
const MAX_PENDING = 4

export interface PendingEncryptedUpload {
  token: string
  dir: string
  uploadPath: string
  fileName: string
  expiresAt: number
  /** A decrypt is staging from this entry — concurrent decrypts of the same
   *  token must not interleave (a release would rm the dir under the other
   *  reader). */
  inFlight: boolean
}

const pending = new Map<string, PendingEncryptedUpload>()

function sweepDir(dir: string): void {
  // Best-effort: the boot-time sweep is the backstop. An open read stream can
  // pin the dir (Windows file locks) and must never fail an unrelated park.
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
    // Never evict an entry mid-decrypt: its read stream opens lazily, so
    // sweeping the dir would fail the in-flight decrypt with a bare ENOENT.
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
      // Every parked upload is mid-decrypt — refuse rather than kill one.
      throw new ActionFailure(429, descriptorFor('backup.error.decryptQueueFull'))
    }
    dropEntry(oldest.token)
    log.info('Pending encrypted upload evicted (cap reached)', { fileName: oldest.fileName })
  }
  const token = randomBytes(16).toString('hex')
  pending.set(token, { token, ...entry, expiresAt: Date.now() + TTL_MS, inFlight: false })
  return token
}

/** Non-consuming read — a wrong password must leave the entry retryable. */
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

/** Atomically marks the entry as being decrypted (synchronous — no await
 *  between read and mark). Callers MUST pair this with `endDecryptClaim`
 *  unless they release the entry outright. */
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

/** Clears the in-flight mark after a decrypt attempt that KEPT the entry
 *  (wrong password — the user retries). No-op when the entry is gone. */
export function endDecryptClaim(token: string): void {
  const entry = pending.get(token)
  if (entry !== undefined) {
    entry.inFlight = false
  }
}

export function releaseEncryptedUpload(token: string): void {
  dropEntry(token)
}

/** Test seam: drop every parked upload (and its dir) between cases. */
export function resetPendingEncryptedUploads(): void {
  for (const token of pending.keys()) {
    releaseEncryptedUpload(token)
  }
}

// The lazy sweep on park() alone would leave an abandoned token's dir on disk
// until the next park, so the TTL overrun is bounded by this timer.
registerJob({
  name: 'backup.pending-upload-sweep',
  nextDelayMs: () => 60 * 1000,
  run: async () => {
    sweepExpired()
  },
})
