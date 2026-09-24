import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'
import { Transform, type TransformCallback } from 'node:stream'

/**
 * Streaming encryption for backup archives (password-based, chunked AEAD).
 *
 * Layout: an 8-byte magic + 16-byte scrypt salt + 4-byte scrypt cost N
 * (big-endian; r=8/p=1 fixed), then a sequence of records
 * `[u32 ciphertext length][1B flags][12B IV][ciphertext][16B GCM tag]`, each
 * record carrying up to 4 MiB of plaintext. Per-record random IVs keep
 * AES-256-GCM nonce-safe while the whole pipeline stays streaming — no
 * full-file buffer on either side. The first record's tag failure is how a
 * wrong password surfaces (mapped to a 400 by the restore perimeter).
 *
 * Record binding: the 0-based record sequence number plus the flags byte
 * ride as GCM AAD, so a ciphertext holder cannot reorder, drop, or replay
 * records without failing authentication; bit 0 of flags marks the FINAL
 * record (every stream ends with exactly one, possibly empty), so a
 * truncated tail is detected by the format itself rather than relying on
 * the inner gzip CRC.
 */

export const BACKUP_ENCRYPTION_MAGIC = Buffer.from('KOBENC01', 'latin1')

const SALT_BYTES = 16
const FLAGS_BYTES = 1
const IV_BYTES = 12
const TAG_BYTES = 16
const KEY_BYTES = 32
const CHUNK_SIZE = 4 * 1024 * 1024
const DEFAULT_SCRYPT_N = 1 << 15
/** Header-declared N beyond this is rejected — a hostile header must not
 *  turn scryptSync into a CPU/memory bomb. Scrypt needs ~128·N·r bytes:
 *  2^17 ≈ 128 MiB, safely inside the 256 MiB maxmem budget. */
const MAX_SCRYPT_N = 1 << 17
const SCRYPT_R = 8
const SCRYPT_P = 1
const HEADER_BYTES = BACKUP_ENCRYPTION_MAGIC.length + SALT_BYTES + 4
const RECORD_OVERHEAD = 4 + FLAGS_BYTES + IV_BYTES + TAG_BYTES
const FLAG_FINAL = 1

/** Wrong password, tampered ciphertext, or a truncated/malformed stream.
 *  `kind` splits the two failure families: 'auth' failures (the GCM tag
 *  check) are retryable with a different password, so the decrypt perimeter
 *  keeps the parked upload; 'format' failures (header, framing, truncation)
 *  fail identically on every retry — the perimeter releases the upload. */
export class BackupDecryptionError extends Error {
  readonly kind: 'auth' | 'format'

  constructor(message: string, options?: { cause?: unknown; kind?: 'auth' | 'format' }) {
    super(message, options)
    this.name = 'BackupDecryptionError'
    this.kind = options?.kind ?? 'format'
  }
}

/** Sniff the first bytes of an archive — the magic is all it takes. */
export function isEncryptedBackup(prefix: Buffer): boolean {
  return (
    prefix.length >= BACKUP_ENCRYPTION_MAGIC.length &&
    prefix.subarray(0, BACKUP_ENCRYPTION_MAGIC.length).equals(BACKUP_ENCRYPTION_MAGIC)
  )
}

function deriveKey(password: string, salt: Buffer, n: number): Buffer {
  // Node's default maxmem (32 MiB) is below what N=2^15/r=8 needs (~33 MiB).
  try {
    return scryptSync(password, salt, KEY_BYTES, { N: n, r: SCRYPT_R, p: SCRYPT_P, maxmem: 256 * 1024 * 1024 })
  } catch (error) {
    throw new BackupDecryptionError('备份加密参数无效', { cause: error })
  }
}

/** The AAD binding every record to its position: seq (4B BE) ‖ flags (1B).
 *  The flags byte is ALSO on the wire (that is how the reader learns
 *  "final"); the AAD makes both fields unforgeable. */
function recordAad(seq: number, flags: number): Buffer {
  const aad = Buffer.alloc(5)
  aad.writeUInt32BE(seq, 0)
  aad[4] = flags
  return aad
}

function encryptRecord(key: Buffer, plaintext: Buffer, seq: number, final: boolean): Buffer {
  const flags = final ? FLAG_FINAL : 0
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(recordAad(seq, flags))
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const header = Buffer.alloc(4 + FLAGS_BYTES)
  header.writeUInt32BE(ciphertext.length, 0)
  header[4] = flags
  return Buffer.concat([header, iv, ciphertext, cipher.getAuthTag()])
}

function decryptRecord(key: Buffer, record: Buffer, expectedSeq: number): { plaintext: Buffer; final: boolean } {
  const length = record.readUInt32BE(0)
  if (length > CHUNK_SIZE || record.length !== RECORD_OVERHEAD + length) {
    throw new BackupDecryptionError('备份密文记录损坏')
  }
  const flags = record[4]!
  if (flags !== 0 && flags !== FLAG_FINAL) {
    throw new BackupDecryptionError('备份密文记录损坏')
  }
  const decipher = createDecipheriv('aes-256-gcm', key, record.subarray(5, 5 + IV_BYTES))
  decipher.setAAD(recordAad(expectedSeq, flags))
  decipher.setAuthTag(record.subarray(5 + IV_BYTES + length))
  try {
    const plaintext = Buffer.concat([
      decipher.update(record.subarray(5 + IV_BYTES, 5 + IV_BYTES + length)),
      decipher.final(),
    ])
    return { plaintext, final: flags === FLAG_FINAL }
  } catch (error) {
    throw new BackupDecryptionError('备份密码错误或文件已损坏', { cause: error, kind: 'auth' })
  }
}

/** Incremental byte accumulator: concat at most once per transform call
 *  instead of once per incoming chunk (O(n²) memcpy on 16-64 KiB gzip
 *  chunks against a 4 MiB pending buffer). */
class ByteAccumulator {
  private chunks: Buffer[] = []
  private buffered = 0

  get length(): number {
    return this.buffered
  }

  push(chunk: Buffer): void {
    this.chunks.push(chunk)
    this.buffered += chunk.length
  }

  /** Materialize the accumulated bytes into one contiguous buffer. */
  peek(): Buffer {
    if (this.chunks.length === 1) {
      return this.chunks[0]!
    }
    const whole = Buffer.concat(this.chunks, this.buffered)
    this.chunks = [whole]
    return whole
  }

  /** Drop the first `bytes` from the accumulator. */
  consume(bytes: number): void {
    const rest = this.peek().subarray(bytes)
    this.chunks = rest.length > 0 ? [rest] : []
    this.buffered = rest.length
  }
}

/** Plaintext → encrypted archive stream. */
export function createBackupCipher(password: string): Transform {
  const salt = randomBytes(SALT_BYTES)
  const key = deriveKey(password, salt, DEFAULT_SCRYPT_N)
  const nField = Buffer.alloc(4)
  nField.writeUInt32BE(DEFAULT_SCRYPT_N, 0)
  let header: Buffer | null = Buffer.concat([BACKUP_ENCRYPTION_MAGIC, salt, nField])
  const pending = new ByteAccumulator()
  let seq = 0

  return new Transform({
    transform(chunk: Buffer, _encoding, callback: TransformCallback) {
      try {
        if (header !== null) {
          this.push(header)
          header = null
        }
        pending.push(chunk)
        while (pending.length >= CHUNK_SIZE) {
          this.push(encryptRecord(key, pending.peek().subarray(0, CHUNK_SIZE), seq, false))
          seq += 1
          pending.consume(CHUNK_SIZE)
        }
        callback()
      } catch (error) {
        callback(error instanceof Error ? error : new Error(String(error)))
      }
    },
    flush(callback: TransformCallback) {
      try {
        if (header !== null) {
          this.push(header)
          header = null
        }
        // Exactly one final record per stream — possibly the ONLY record,
        // empty, when the plaintext is empty.
        this.push(encryptRecord(key, pending.length > 0 ? pending.peek() : Buffer.alloc(0), seq, true))
        callback()
      } catch (error) {
        callback(error instanceof Error ? error : new Error(String(error)))
      }
    },
  })
}

/** Encrypted archive stream → plaintext. The first record's GCM tag is the
 *  password check — a wrong password fails there, mid-stream. */
export function createBackupDecipher(password: string): Transform {
  const incoming = new ByteAccumulator()
  let key: Buffer | null = null
  let expectedSeq = 0
  let sawFinal = false

  function parseHeader(): void {
    const buffer = incoming.peek()
    if (!isEncryptedBackup(buffer)) {
      throw new BackupDecryptionError('备份加密头无效')
    }
    const n = buffer.readUInt32BE(BACKUP_ENCRYPTION_MAGIC.length + SALT_BYTES)
    if (n < 2 || (n & (n - 1)) !== 0 || n > MAX_SCRYPT_N) {
      throw new BackupDecryptionError('备份加密参数无效')
    }
    key = deriveKey(
      password,
      buffer.subarray(BACKUP_ENCRYPTION_MAGIC.length, BACKUP_ENCRYPTION_MAGIC.length + SALT_BYTES),
      n,
    )
    incoming.consume(HEADER_BYTES)
  }

  return new Transform({
    transform(chunk: Buffer, _encoding, callback: TransformCallback) {
      try {
        incoming.push(chunk)
        if (key === null) {
          if (incoming.length < HEADER_BYTES) {
            callback()
            return
          }
          parseHeader()
        }
        // Narrowing must survive the closure assignment in parseHeader.
        const derivedKey = key
        if (derivedKey === null) {
          throw new BackupDecryptionError('备份加密头无效')
        }
        while (incoming.length >= 4) {
          // Pre-check the DECLARED length before waiting for the record to
          // arrive: a forged multi-GiB length must not turn this buffer
          // into an unbounded accumulator.
          const buffer = incoming.peek()
          const declaredLength = buffer.readUInt32BE(0)
          if (declaredLength > CHUNK_SIZE) {
            throw new BackupDecryptionError('备份密文记录损坏')
          }
          const recordBytes = RECORD_OVERHEAD + declaredLength
          if (incoming.length < recordBytes) {
            break
          }
          if (sawFinal) {
            throw new BackupDecryptionError('备份密文记录损坏')
          }
          const { plaintext, final } = decryptRecord(derivedKey, buffer.subarray(0, recordBytes), expectedSeq)
          expectedSeq += 1
          sawFinal = final
          this.push(plaintext)
          incoming.consume(recordBytes)
        }
        callback()
      } catch (error) {
        callback(error instanceof Error ? error : new Error(String(error)))
      }
    },
    flush(callback: TransformCallback) {
      if (key === null || incoming.length !== 0 || !sawFinal) {
        callback(new BackupDecryptionError('备份密文不完整或已截断'))
        return
      }
      callback()
    },
  })
}
