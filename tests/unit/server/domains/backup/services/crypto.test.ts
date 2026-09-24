import { randomBytes } from 'node:crypto'
import { Readable, Writable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { describe, expect, it } from 'vitest'

import {
  BACKUP_ENCRYPTION_MAGIC,
  BackupDecryptionError,
  createBackupCipher,
  createBackupDecipher,
  isEncryptedBackup,
} from '@/server/domains/backup/services/crypto'

async function collect(source: Readable): Promise<Buffer> {
  const chunks: Buffer[] = []
  const sink = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      chunks.push(chunk)
      callback()
    },
  })
  await pipeline(source, sink)
  return Buffer.concat(chunks)
}

async function encrypt(plaintext: Buffer, password: string): Promise<Buffer> {
  return collect(Readable.from([plaintext]).pipe(createBackupCipher(password)))
}

async function decrypt(ciphertext: Buffer, password: string): Promise<Buffer> {
  return collect(Readable.from([ciphertext]).pipe(createBackupDecipher(password)))
}

/** Capture the decryption failure for kind/message assertions. */
async function decryptError(source: Buffer | Readable, password: string): Promise<BackupDecryptionError> {
  const stream = Buffer.isBuffer(source) ? Readable.from([source]) : source
  const error: unknown = await collect(stream.pipe(createBackupDecipher(password))).then(
    () => {
      throw new Error('decrypt unexpectedly succeeded')
    },
    (caught: unknown) => caught,
  )
  expect(error).toBeInstanceOf(BackupDecryptionError)
  return error as BackupDecryptionError
}

describe('backup crypto', () => {
  it('round-trips a small payload', async () => {
    const plaintext = Buffer.from('kobato backup payload', 'utf8')
    const ciphertext = await encrypt(plaintext, 'secret-password')
    expect(isEncryptedBackup(ciphertext)).toBe(true)
    expect(ciphertext.subarray(0, 8).equals(BACKUP_ENCRYPTION_MAGIC)).toBe(true)
    expect(await decrypt(ciphertext, 'secret-password')).toEqual(plaintext)
  })

  it('round-trips a payload spanning multiple chunks', async () => {
    // 4 MiB chunk size: 9 MiB of random bytes crosses the boundary twice.
    const plaintext = randomBytes(9 * 1024 * 1024)
    const ciphertext = await encrypt(plaintext, 'chunked-password')
    // Buffer.equals, not toEqual — vitest's deep equality walks 9 MiB byte by byte.
    expect((await decrypt(ciphertext, 'chunked-password')).equals(plaintext)).toBe(true)
  }, 30_000)

  it('rejects a wrong password (auth failure — retryable)', async () => {
    const ciphertext = await encrypt(Buffer.from('sensitive', 'utf8'), 'right-password')
    const error = await decryptError(ciphertext, 'wrong-password')
    expect(error.kind).toBe('auth')
    expect(error.message).toBe('备份密码错误或文件已损坏')
  })

  it('rejects a tampered auth tag (auth failure)', async () => {
    const ciphertext = await encrypt(Buffer.from('sensitive', 'utf8'), 'secret-password')
    // Flip the last byte — inside the trailing GCM tag.
    ciphertext[ciphertext.length - 1] = ciphertext[ciphertext.length - 1]! ^ 0xff
    const error = await decryptError(ciphertext, 'secret-password')
    expect(error.kind).toBe('auth')
  })

  it('rejects a truncated stream (format failure — no retry can help)', async () => {
    const ciphertext = await encrypt(Buffer.from('sensitive', 'utf8'), 'secret-password')
    const error = await decryptError(ciphertext.subarray(0, ciphertext.length - 10), 'secret-password')
    expect(error.kind).toBe('format')
    expect(error.message).toBe('备份密文不完整或已截断')
  })

  it('round-trips an empty plaintext (header + one empty final record)', async () => {
    const ciphertext = await encrypt(Buffer.alloc(0), 'secret-password')
    expect(isEncryptedBackup(ciphertext)).toBe(true)
    const plaintext = await decrypt(ciphertext, 'secret-password')
    expect(plaintext.length).toBe(0)
  })

  // Record layout: [u32 ctLen][1B flags][12B IV][ct][16B tag]; the file header is 28 bytes.
  const HEADER_BYTES = 28
  const RECORD_OVERHEAD = 4 + 1 + 12 + 16

  function splitRecords(ciphertext: Buffer): { header: Buffer; records: Buffer[] } {
    const records: Buffer[] = []
    let offset = HEADER_BYTES
    while (offset < ciphertext.length) {
      const size = RECORD_OVERHEAD + ciphertext.readUInt32BE(offset)
      records.push(ciphertext.subarray(offset, offset + size))
      offset += size
    }
    return { header: ciphertext.subarray(0, HEADER_BYTES), records }
  }

  it('rejects reordered records (sequence numbers bind via AAD)', async () => {
    // 5 MiB: one full 4 MiB record + a final record with the rest.
    const ciphertext = await encrypt(randomBytes(5 * 1024 * 1024), 'secret-password')
    const { header, records } = splitRecords(ciphertext)
    expect(records).toHaveLength(2)
    const reordered = Buffer.concat([header, records[1]!, records[0]!])
    const error = await decryptError(reordered, 'secret-password')
    expect(error.kind).toBe('auth')
  }, 30_000)

  it('rejects records appended after the final one', async () => {
    const ciphertext = await encrypt(Buffer.from('sensitive', 'utf8'), 'secret-password')
    const { records } = splitRecords(ciphertext)
    const appended = Buffer.concat([ciphertext, records[records.length - 1]!])
    const error = await decryptError(appended, 'secret-password')
    expect(error.kind).toBe('format')
    expect(error.message).toBe('备份密文记录损坏')
  })

  it('rejects a forged giant record length up front, without buffering it (format failure)', async () => {
    const ciphertext = await encrypt(Buffer.from('sensitive', 'utf8'), 'secret-password')
    // Claim a ~4 GiB record: the decipher must fail fast, not accumulate.
    ciphertext.writeUInt32BE(0xffffffff, HEADER_BYTES)
    const error = await decryptError(ciphertext, 'secret-password')
    expect(error.kind).toBe('format')
    expect(error.message).toBe('备份密文记录损坏')
  })

  it('rejects a header declaring an invalid scrypt cost (format failure)', async () => {
    const ciphertext = await encrypt(Buffer.from('sensitive', 'utf8'), 'secret-password')
    // N field: magic (8) + salt (16) → bytes 24..28. N=1 is not a legal scrypt cost.
    ciphertext.writeUInt32BE(1, 24)
    const error = await decryptError(ciphertext, 'secret-password')
    expect(error.kind).toBe('format')
    expect(error.message).toBe('备份加密参数无效')
  })

  it('rejects a header declaring N above the cap BEFORE running scrypt', async () => {
    // A legal-looking header (magic + salt + N) with N = 2^18 > MAX_SCRYPT_N
    // (2^17): rejected by the header check, so scryptSync never runs and this
    // case completes in milliseconds — a hostile header must not become a
    // CPU/memory bomb.
    const header = Buffer.alloc(HEADER_BYTES)
    BACKUP_ENCRYPTION_MAGIC.copy(header, 0)
    randomBytes(16).copy(header, 8)
    header.writeUInt32BE(1 << 18, 24)
    const error = await decryptError(header, 'secret-password')
    expect(error.kind).toBe('format')
    expect(error.message).toBe('备份加密参数无效')
  })

  it('rejects a stream whose FINAL record was stripped (format failure)', async () => {
    // Exactly 4 MiB: one full non-final record + one EMPTY final record —
    // slicing off the tail record leaves a stream that parses cleanly but
    // never terminates; the flush check must call it truncated.
    const ciphertext = await encrypt(randomBytes(4 * 1024 * 1024), 'secret-password')
    const { header, records } = splitRecords(ciphertext)
    expect(records).toHaveLength(2)
    expect(records[1]![4]).toBe(1)
    const stripped = Buffer.concat([header, records[0]!])
    const error = await decryptError(stripped, 'secret-password')
    expect(error.kind).toBe('format')
    expect(error.message).toBe('备份密文不完整或已截断')
  }, 30_000)

  it('rejects a tampered flags byte: FINAL forgery fails auth, an invalid value fails the format check', async () => {
    // 5 MiB → records[0] is a full non-final record (flags byte at offset 4).
    const ciphertext = await encrypt(randomBytes(5 * 1024 * 1024), 'secret-password')

    // 0 → 1: the record now CLAIMS final, but the AAD (seq‖flags) no longer
    // matches the tag — the GCM check fails as an auth error.
    const forgedFinal = Buffer.from(ciphertext)
    forgedFinal[HEADER_BYTES + 4] = 1
    const authError = await decryptError(forgedFinal, 'secret-password')
    expect(authError.kind).toBe('auth')
    expect(authError.message).toBe('备份密码错误或文件已损坏')

    // 0 → 2: not a defined flag — rejected by the framing check before decryption.
    const invalidFlags = Buffer.from(ciphertext)
    invalidFlags[HEADER_BYTES + 4] = 2
    const formatError = await decryptError(invalidFlags, 'secret-password')
    expect(formatError.kind).toBe('format')
    expect(formatError.message).toBe('备份密文记录损坏')
  }, 30_000)

  it('round-trips when the ciphertext arrives split mid-record', async () => {
    const plaintext = randomBytes(1024 * 1024 + 7)
    const ciphertext = await encrypt(plaintext, 'secret-password')
    // Cut inside the first (only) record — the accumulator must reassemble it.
    const cut = HEADER_BYTES + 100
    const decrypted = await collect(
      Readable.from([ciphertext.subarray(0, cut), ciphertext.subarray(cut)]).pipe(
        createBackupDecipher('secret-password'),
      ),
    )
    expect(decrypted.equals(plaintext)).toBe(true)
  })

  it('detects the magic header', () => {
    expect(isEncryptedBackup(Buffer.from('KOBENC01-more-bytes', 'latin1'))).toBe(true)
    expect(isEncryptedBackup(Buffer.from([0x1f, 0x8b, 0x08]))).toBe(false)
    expect(isEncryptedBackup(Buffer.from('KOB', 'latin1'))).toBe(false)
  })
})
