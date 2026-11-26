import { createSignedCookie, type SignedCookie } from '@kobato/server/infra/http/signed-cookie'
import { createCookie, type Cookie } from 'react-router'
import { describe, expect, it } from 'vitest'

const SECRET_ALPHA = 'test-secret-alpha'
const SECRET_BETA = 'test-secret-beta'

function makeOracle(secrets: string[], secure = false): Cookie {
  return createCookie('__session', {
    httpOnly: true,
    maxAge: 1209600,
    path: '/',
    sameSite: 'lax',
    secure,
    secrets,
  })
}

function makeCodec(secrets: string[], secure = false): SignedCookie {
  return createSignedCookie({
    name: '__session',
    secrets,
    maxAge: 1209600,
    path: '/',
    httpOnly: true,
    secure,
    sameSite: 'lax',
  })
}

function cookiePair(setCookie: string): string {
  return setCookie.split(';')[0]!
}

describe('createSignedCookie wire compatibility with react-router createCookie', () => {
  it('issues a byte-identical cookie to the react-router implementation (secure off and on)', async () => {
    for (const secure of [false, true]) {
      expect(await makeCodec([SECRET_ALPHA], secure).serializeValue('sid-123')).toBe(
        await makeOracle([SECRET_ALPHA], secure).serialize('sid-123'),
      )
    }
  })

  it('issues a byte-identical cookie under a maxAge override', async () => {
    expect(await makeCodec([SECRET_ALPHA]).serializeValue('sid-123', 3600)).toBe(
      await makeOracle([SECRET_ALPHA]).serialize('sid-123', { maxAge: 3600 }),
    )
  })

  it('issues a byte-identical expired cookie', async () => {
    expect(makeCodec([SECRET_ALPHA]).serializeExpired()).toBe(
      await makeOracle([SECRET_ALPHA]).serialize('', { maxAge: undefined, expires: new Date(0) }),
    )
  })

  it('parses a cookie issued by the react-router implementation', async () => {
    const setCookie = await makeOracle([SECRET_ALPHA]).serialize('sid-123')
    expect(await makeCodec([SECRET_ALPHA]).parse(cookiePair(setCookie))).toBe('sid-123')
  })

  it('round-trips non-ASCII values in both directions', async () => {
    const value = 'sïd-☃-テスト'
    const oldIssued = await makeOracle([SECRET_ALPHA]).serialize(value)
    expect(await makeCodec([SECRET_ALPHA]).parse(cookiePair(oldIssued))).toBe(value)
    const newIssued = await makeCodec([SECRET_ALPHA]).serializeValue(value)
    expect(await makeOracle([SECRET_ALPHA]).parse(cookiePair(newIssued))).toBe(value)
  })
})

describe('createSignedCookie signing', () => {
  it('fails fast when no signing secret is configured', () => {
    expect(() => makeCodec([])).toThrow('createSignedCookie requires at least one secret')
  })

  it('signs with the first secret and verifies against every secret (rotation)', async () => {
    const rotated = makeCodec([SECRET_ALPHA, SECRET_BETA])
    const legacyIssued = await makeOracle([SECRET_BETA]).serialize('sid-legacy')
    expect(await rotated.parse(cookiePair(legacyIssued))).toBe('sid-legacy')

    const newIssued = await rotated.serializeValue('sid-new')
    expect(await makeOracle([SECRET_ALPHA]).parse(cookiePair(newIssued))).toBe('sid-new')
    expect(await makeOracle([SECRET_BETA]).parse(cookiePair(newIssued))).toBeNull()
  })

  it('rejects a tampered signature', async () => {
    const codec = makeCodec([SECRET_ALPHA])
    const setCookie = await codec.serializeValue('sid-123')
    const pair = cookiePair(setCookie)
    const last = pair[pair.length - 1]!
    const flipped = `${pair.slice(0, -1)}${last === 'A' ? 'B' : 'A'}`
    expect(await codec.parse(flipped)).toBeNull()
  })

  it('rejects a tampered payload', async () => {
    const codec = makeCodec([SECRET_ALPHA])
    const setCookie = await codec.serializeValue('sid-123')
    const pair = cookiePair(setCookie)
    const eq = pair.indexOf('=')
    const first = pair[eq + 1]!
    const flipped = `${pair.slice(0, eq + 1)}${first === 'A' ? 'B' : 'A'}${pair.slice(eq + 2)}`
    expect(await codec.parse(flipped)).toBeNull()
  })

  it('never throws on malformed input', async () => {
    const codec = makeCodec([SECRET_ALPHA])
    await expect(codec.parse(null)).resolves.toBeNull()
    await expect(codec.parse('')).resolves.toBeNull()
    await expect(codec.parse('other=1')).resolves.toBeNull()
    await expect(codec.parse('__session=')).resolves.toBeNull()
    await expect(codec.parse('__session=abc')).resolves.toBeNull()
    await expect(codec.parse('__session=abc.')).resolves.toBeNull()
    await expect(codec.parse('__session=.def')).resolves.toBeNull()
    await expect(codec.parse('__session=!!!.@@@')).resolves.toBeNull()
    await expect(codec.parse('__session=%')).resolves.toBeNull()
  })

  it('rejects a validly-signed payload that is not a string', async () => {
    const codec = makeCodec([SECRET_ALPHA])
    const numeric = await makeOracle([SECRET_ALPHA]).serialize(123)
    expect(await codec.parse(cookiePair(numeric))).toBeNull()
    const objectValued = await makeOracle([SECRET_ALPHA]).serialize({ nested: true })
    expect(await codec.parse(cookiePair(objectValued))).toBeNull()
  })
})

describe('createSignedCookie serializeExpired', () => {
  it('parses an empty cookie value as no session', async () => {
    const codec = makeCodec([SECRET_ALPHA])
    expect(await codec.parse(cookiePair(codec.serializeExpired()))).toBeNull()
  })
})
