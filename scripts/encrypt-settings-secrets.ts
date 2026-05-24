// One-shot migration: encrypt plaintext API keys already stored in the DB.
//
// Usage:
//   ENCRYPTION_KEY=your-key npx tsx scripts/encrypt-settings-secrets.ts
//
// Safe to re-run — skips values that are already encrypted (prefixed with "enc:").
// Requires ENCRYPTION_KEY to be set; exits with an error otherwise.
//
// oxlint-disable no-console

import { createCipheriv, createHash, randomBytes } from 'node:crypto'
import process from 'node:process'

const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12
const ENCRYPTED_PREFIX = 'enc:'

const SECRET_SECTIONS = [
  { scope: 'blog.mail', path: 'mail', field: 'apiKey' },
  { scope: 'blog.assets', path: 'storage', field: 'secretAccessKey' },
  { scope: 'blog.search', path: 'search', field: 'apiKey' },
]

function getKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY
  if (!secret) {
    console.error('ENCRYPTION_KEY env var is required')
    process.exit(1)
  }
  return createHash('sha256').update(secret).digest()
}

function encrypt(plaintext: string): string {
  const key = getKey()
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${ENCRYPTED_PREFIX}${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL env var is required')
    process.exit(1)
  }

  const { default: pg } = await import('pg')
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })

  try {
    for (const { scope, path, field } of SECRET_SECTIONS) {
      const { rows } = await pool.query('SELECT data FROM setting WHERE scope = $1', [scope])
      if (rows.length === 0) {
        console.log(`[${scope}] no row found — skipping`)
        continue
      }

      const data = rows[0].data as Record<string, unknown>
      const bucket = data[path] as Record<string, unknown> | undefined
      if (!bucket) {
        console.log(`[${scope}] path "${path}" not found in data — skipping`)
        continue
      }

      const value = bucket[field]
      if (typeof value !== 'string' || value === '') {
        console.log(`[${scope}] ${path}.${field} is empty or not a string — skipping`)
        continue
      }

      if (value.startsWith(ENCRYPTED_PREFIX)) {
        console.log(`[${scope}] ${path}.${field} already encrypted — skipping`)
        continue
      }

      const encrypted = encrypt(value)
      bucket[field] = encrypted

      await pool.query('UPDATE setting SET data = $1 WHERE scope = $2', [JSON.stringify(data), scope])
      console.log(`[${scope}] ${path}.${field} encrypted OK`)
    }

    console.log('\nDone. All plaintext secrets have been encrypted.')
  } finally {
    await pool.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
