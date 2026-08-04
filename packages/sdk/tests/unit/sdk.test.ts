import { buildProxyHeaders } from '@kobato/sdk/proxy'
import { createKeyAuthSigner } from '@kobato/sdk/signer'
import { parseCommentTokenHeader, pickCommentToken, serializeCommentTokenHeader } from '@kobato/sdk/token'
import { generateKeyPairSync } from 'node:crypto'
import { describe, expect, it } from 'vitest'

describe('sdk — signer', () => {
  it('produces a three-part EdDSA JWT with the expected claims', () => {
    const { privateKey } = generateKeyPairSync('ed25519')
    const signer = createKeyAuthSigner(privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), 'key-1')
    const token = signer.sign({ scope: ['content:write'] })
    const [header, payload] = token.split('.')
    expect(header).toBeTruthy()
    expect(payload).toBeTruthy()
    expect(token.split('.')).toHaveLength(3)
    const decoded = JSON.parse(Buffer.from(payload!, 'base64url').toString('utf8')) as {
      iss: string
      scope: string[]
      exp: number
    }
    expect(decoded.iss).toBe('key-1')
    expect(decoded.scope).toEqual(['content:write'])
    const now = Math.floor(Date.now() / 1000)
    expect(decoded.exp).toBeGreaterThan(now)
    expect(decoded.exp).toBeLessThanOrEqual(now + 5 * 60)
  })
})

describe('sdk — comment token helpers', () => {
  it('round-trips the jar through the header wire format and picks freshest', () => {
    const jar = { 'page-1': [{ token: 'tok-a', expiresAt: Math.floor(Date.now() / 1000) + 600 }] }
    const header = serializeCommentTokenHeader(jar)
    const parsed = parseCommentTokenHeader(header)
    expect(parsed['page-1']?.[0]?.token).toBe('tok-a')
    expect(pickCommentToken(parsed, 'page-1')).toBe('tok-a')
    expect(pickCommentToken(parsed, 'other-page')).toBeNull()
  })

  it('ignores malformed headers', () => {
    expect(parseCommentTokenHeader('not-json')).toEqual({})
    expect(parseCommentTokenHeader(null)).toEqual({})
  })
})

describe('sdk — proxy headers', () => {
  it('assembles the contract header family, omitting empty values', () => {
    const headers = buildProxyHeaders({
      jwt: 'jwt-1',
      commentToken: 'tok',
      forwardedFor: '198.51.100.9',
      forwardedUserAgent: 'Mozilla/5.0',
    })
    expect(headers).toEqual({
      Authorization: 'Bearer jwt-1',
      'X-Kobato-Comment-Token': 'tok',
      'X-Forwarded-For': '198.51.100.9',
      'X-Forwarded-User-Agent': 'Mozilla/5.0',
    })
    const minimal = buildProxyHeaders({ jwt: 'jwt-2' })
    expect(Object.keys(minimal)).toEqual(['Authorization'])
  })

  it('omits Authorization when no JWT is provided (anonymous forwarding)', () => {
    expect(buildProxyHeaders({ jwt: null, commentToken: 'tok' })).toEqual({ 'X-Kobato-Comment-Token': 'tok' })
    expect(
      buildProxyHeaders({
        jwt: '',
        commentToken: null,
        sessionToken: '',
        forwardedFor: null,
        forwardedUserAgent: undefined,
      }),
    ).toEqual({})
  })
})
