import {
  claimEncryptedUploadForDecrypt,
  endDecryptClaim,
  parkEncryptedUpload,
  peekEncryptedUpload,
  releaseEncryptedUpload,
  resetPendingEncryptedUploads,
} from '@kobato/server/domains/backup/pending-uploads'
import { ActionFailure } from '@kobato/server/infra/http/errors'
import { scheduleRegisteredJob } from '@kobato/server/infra/job-registry'
import { stopAllScheduledJobs } from '@kobato/server/infra/scheduler-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let seq = 0
function makeEntry() {
  seq += 1
  const dir = `/tmp/kobato-restore-pending-${seq}`
  return { dir, uploadPath: `${dir}/upload.bin`, fileName: `backup-${seq}.enc` }
}

const TTL_MS = 10 * 60 * 1000

describe('pending encrypted uploads', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    stopAllScheduledJobs()
    resetPendingEncryptedUploads()
    vi.useRealTimers()
  })

  it('parks and peeks an entry; an expired entry peeks null and is released', () => {
    const entry = makeEntry()
    const token = parkEncryptedUpload(entry)

    const peeked = peekEncryptedUpload(token)
    expect(peeked).toMatchObject({ token, dir: entry.dir, uploadPath: entry.uploadPath, fileName: entry.fileName })
    expect(peeked!.inFlight).toBe(false)

    vi.advanceTimersByTime(TTL_MS + 60_000)
    expect(peekEncryptedUpload(token)).toBeNull()
    expect(claimEncryptedUploadForDecrypt(token)).toEqual({ ok: false, reason: 'missing' })
  })

  it('claim is an in-flight mutex: second claim conflicts, endDecryptClaim re-opens it', () => {
    const token = parkEncryptedUpload(makeEntry())

    const first = claimEncryptedUploadForDecrypt(token)
    expect(first.ok).toBe(true)
    expect(claimEncryptedUploadForDecrypt(token)).toEqual({ ok: false, reason: 'in-flight' })

    endDecryptClaim(token)
    const again = claimEncryptedUploadForDecrypt(token)
    expect(again.ok).toBe(true)
  })

  it('claim of an expired entry reports expired and releases it', () => {
    const token = parkEncryptedUpload(makeEntry())
    vi.advanceTimersByTime(TTL_MS + 60_000)

    expect(claimEncryptedUploadForDecrypt(token)).toEqual({ ok: false, reason: 'expired' })
    expect(peekEncryptedUpload(token)).toBeNull()
  })

  it('release drops the entry outright', () => {
    const token = parkEncryptedUpload(makeEntry())
    releaseEncryptedUpload(token)
    expect(peekEncryptedUpload(token)).toBeNull()
  })

  it('evicts the earliest-expiring NON-in-flight entry when the cap is reached', () => {
    const tokens: string[] = []
    for (let i = 0; i < 4; i += 1) {
      tokens.push(parkEncryptedUpload(makeEntry()))
      vi.advanceTimersByTime(1_000)
    }
    expect(claimEncryptedUploadForDecrypt(tokens[1]!).ok).toBe(true)

    const fifth = parkEncryptedUpload(makeEntry())

    expect(peekEncryptedUpload(tokens[0]!)).toBeNull()
    expect(peekEncryptedUpload(tokens[1]!)).not.toBeNull()
    expect(peekEncryptedUpload(tokens[2]!)).not.toBeNull()
    expect(peekEncryptedUpload(tokens[3]!)).not.toBeNull()
    expect(peekEncryptedUpload(fifth)).not.toBeNull()
  })

  it('refuses the park with 429 when every parked entry is mid-decrypt', () => {
    const tokens: string[] = []
    for (let i = 0; i < 4; i += 1) {
      tokens.push(parkEncryptedUpload(makeEntry()))
    }
    for (const token of tokens) {
      expect(claimEncryptedUploadForDecrypt(token).ok).toBe(true)
    }

    const error: unknown = (() => {
      try {
        parkEncryptedUpload(makeEntry())
        return null
      } catch (caught) {
        return caught
      }
    })()
    expect(error).toBeInstanceOf(ActionFailure)
    expect((error as ActionFailure).status).toBe(429)
    expect((error as ActionFailure).descriptor).toMatchObject({ messageKey: 'backup.error.decryptQueueFull' })
  })
})

describe('pending encrypted uploads — registered sweep timer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    stopAllScheduledJobs()
    resetPendingEncryptedUploads()
    vi.useRealTimers()
  })

  it('sweeps expired entries on the timer, not only on the next park', async () => {
    const token = parkEncryptedUpload(makeEntry())
    vi.advanceTimersByTime(TTL_MS + 1)

    scheduleRegisteredJob('backup.pending-upload-sweep')
    await vi.advanceTimersByTimeAsync(60_000 + 1)

    expect(claimEncryptedUploadForDecrypt(token)).toEqual({ ok: false, reason: 'missing' })
  })
})
