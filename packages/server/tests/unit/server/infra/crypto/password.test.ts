import bcrypt from 'bcryptjs'
import { describe, expect, it } from 'vitest'

// There is no `hashPassword`/`verifyPassword` wrapper — bcryptjs is called inline from
// `infra/db/operations/user.ts`. These tests pin the bcryptjs contract so a swap or
// upgrade surfaces here, not at first failed login.

describe('auth/password — bcryptjs contract we rely on', () => {
  const password = 'correct horse battery staple'

  it('produces a bcrypt-shaped hash ($2a/$2b/$2y prefix, 60 chars)', async () => {
    const hash = await bcrypt.hash(password, 4)
    expect(hash).toMatch(/^\$2[aby]\$\d{2}\$.{53}$/)
    expect(hash).toHaveLength(60)
  })

  it('compare returns true for the original password', async () => {
    const hash = await bcrypt.hash(password, 4)
    expect(await bcrypt.compare(password, hash)).toBe(true)
  })

  it('compare returns false for any other password', async () => {
    const hash = await bcrypt.hash(password, 4)
    expect(await bcrypt.compare('nope', hash)).toBe(false)
    expect(await bcrypt.compare('', hash)).toBe(false)
    expect(await bcrypt.compare(`${password} `, hash)).toBe(false)
  })

  it('hashes UTF-8 (multibyte) passwords roundtrip correctly', async () => {
    const utf8 = '你好-密码-🦀'
    const hash = await bcrypt.hash(utf8, 4)
    expect(await bcrypt.compare(utf8, hash)).toBe(true)
    expect(await bcrypt.compare('你好-密码', hash)).toBe(false)
  })

  it('silently truncates passwords longer than 72 bytes (known bcrypt limit)', async () => {
    // bcrypt drops everything beyond byte 72, so two passwords sharing the first 72 bytes
    // hash identically; a swap to a non-bcrypt algorithm must make that explicit.
    const base = 'a'.repeat(72)
    const hash = await bcrypt.hash(base, 4)
    expect(await bcrypt.compare(`${base}xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`, hash)).toBe(true)
    expect(await bcrypt.compare('a'.repeat(71), hash)).toBe(false)
  })

  it('rejects empty hash inputs gracefully (not exception)', async () => {
    expect(await bcrypt.compare(password, '')).toBe(false)
  })
})
