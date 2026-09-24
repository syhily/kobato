import { randomBytes } from 'node:crypto'
import { rmSync } from 'node:fs'

import { ActionFailure } from '@/server/infra/http/errors'
import { getLogger } from '@/server/infra/logger'

/**
 * Encrypted uploads parked between the two restore calls: `upload-restore`
 * stages the raw bytes, detects the encryption magic, and parks the temp
 * dir here; the follow-up `upload-restore/decrypt` call resolves the entry
 * by token and stages WITH the password. Entries expire after 10 minutes
 * (lazy sweep on write); the dirs use RESTORE_TEMP_PREFIX so a crash leaves
 * them to the boot-time sweep.
 */

const log = getLogger('backup.pending-uploads')

const TTL_MS = 10 * 60 * 1000
/** Each parked upload holds up to MAX_BACKUP_FILE_SIZE on the temp disk —
 *  cap the count so repeated uploads without a decrypt can't accumulate
 *  unboundedly. The oldest (earliest expiring) entry is evicted first. */
const MAX_PENDING = 4

export interface PendingEncryptedUpload {
  token: string
  dir: string
  uploadPath: string
  fileName: string
  expiresAt: number
  /** A decrypt call is staging from this entry right now — concurrent
   *  decrypts of the same token must not interleave (the first finisher's
   *  release would rm the dir under the second one's read stream). */
  inFlight: boolean
}

const pending = new Map<string, PendingEncryptedUpload>()

function sweepDir(dir: string): void {
  // Best-effort: the boot-time sweep is the backstop. A decrypt's open read
  // stream can pin the dir (Windows file locks) — that must never fail an
  // unrelated park call.
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
    // Evict the earliest-expiring entry, but NEVER one mid-decrypt: its
    // read stream opens lazily, so sweeping its dir would fail the
    // in-flight decrypt with a bare ENOENT.
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
      // Every parked upload is mid-decrypt (vanishingly unlikely on an
      // admin-only surface) — refuse the park instead of killing one.
      throw new ActionFailure(429, '待解密的备份过多，请稍后再试。')
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

/** Atomically mark the entry as being decrypted (synchronous — no await
 *  between read and mark, so no interleaving). The caller MUST pair this
 *  with `endDecryptClaim` unless it releases the entry outright. */
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

/** Clear the in-flight mark after a decrypt attempt that KEPT the entry
 *  (wrong password — the user retries). No-op when the entry is gone. */
export function endDecryptClaim(token: string): void {
  const entry = pending.get(token)
  if (entry !== undefined) {
    entry.inFlight = false
  }
}

/** Drop the entry and sweep its temp dir. Call after a successful claim of
 *  the restore slot (the staged copy lives in its own dir by then) or when
 *  giving up. */
export function releaseEncryptedUpload(token: string): void {
  dropEntry(token)
}

/** Test seam: drop every parked upload (and its dir) between cases. */
export function resetPendingEncryptedUploads(): void {
  for (const token of pending.keys()) {
    releaseEncryptedUpload(token)
  }
}
