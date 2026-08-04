import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { makeAuthedCtx, makePublicCtx } from '#/_helpers/mock-ctx'

import {
  FRONTEND_KEY_CLOCK_SKEW_SECONDS,
  FRONTEND_KEY_MAX_EXP_SECONDS,
  verifyFrontendJwt,
} from '@kobato/server/domains/apikey/service'
import { establishLoginSession } from '@kobato/server/domains/auth/primitives'
import { getRequestSession } from '@kobato/server/domains/auth/session-storage'
import { adminApiKeyRouter } from '@kobato/server/http/controllers/admin/apikey.controller'
import { commentTokenCookie, frontendKeyAuth, publicProc } from '@kobato/server/http/orpc-base'
import { user } from '@kobato/server/infra/db/schema/user'
import { call } from '@orpc/server'
import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'

const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
})

function makeKeyPair(): { publicKeyPem: string; privateKey: KeyObject } {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  return { publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(), privateKey }
}

function signJwt(privateKey: KeyObject, payload: object, header = { alg: 'EdDSA', typ: 'JWT' }): string {
  const enc = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const data = `${enc(header)}.${enc(payload)}`
  const signature = sign(null, Buffer.from(data, 'utf8'), privateKey)
  return `${data}.${signature.toString('base64url')}`
}

describe('admin api keys', () => {
  it('registers, lists and revokes a key', async () => {
    const { publicKeyPem } = makeKeyPair()
    const registered = await call(
      adminApiKeyRouter.register,
      { name: 'official-frontend', publicKeyPem },
      { context: makeAuthedCtx({ db, role: 'admin' }) },
    )
    expect(registered.id).toBeTruthy()
    expect(registered.scopes).toContain('content:write')

    const listed = await call(adminApiKeyRouter.list, {}, { context: makeAuthedCtx({ db, role: 'admin' }) })
    expect(listed.keys).toHaveLength(1)

    const revoked = await call(
      adminApiKeyRouter.revoke,
      { id: registered.id },
      { context: makeAuthedCtx({ db, role: 'admin' }) },
    )
    expect(revoked.revoked).toBe(true)
  })
})

describe('frontend JWT verification', () => {
  it('accepts a valid EdDSA JWT with the write scope', async () => {
    const { publicKeyPem, privateKey } = makeKeyPair()
    const registered = await call(
      adminApiKeyRouter.register,
      { name: 'frontend', publicKeyPem },
      { context: makeAuthedCtx({ db, role: 'admin' }) },
    )
    const now = Math.floor(Date.now() / 1000)
    const token = signJwt(privateKey, { iss: registered.id, scope: ['content:write'], exp: now + 120 })

    const verified = await verifyFrontendJwt(db, token)
    expect(verified).not.toBeNull()
    expect(verified?.keyId).toBe(registered.id)
  })

  it('rejects a wrong signature', async () => {
    const { publicKeyPem, privateKey } = makeKeyPair()
    const other = makeKeyPair()
    const registered = await call(
      adminApiKeyRouter.register,
      { name: 'frontend', publicKeyPem },
      { context: makeAuthedCtx({ db, role: 'admin' }) },
    )
    const now = Math.floor(Date.now() / 1000)
    // Signed with a DIFFERENT private key.
    const token = signJwt(other.privateKey, { iss: registered.id, scope: ['content:write'], exp: now + 120 })
    expect(await verifyFrontendJwt(db, token)).toBeNull()
    void privateKey
  })

  it('rejects an unknown key id', async () => {
    const { privateKey } = makeKeyPair()
    const now = Math.floor(Date.now() / 1000)
    const token = signJwt(privateKey, { iss: 'does-not-exist', scope: ['content:write'], exp: now + 120 })
    expect(await verifyFrontendJwt(db, token)).toBeNull()
  })

  it('rejects an expired token outside the skew window', async () => {
    const { publicKeyPem, privateKey } = makeKeyPair()
    const registered = await call(
      adminApiKeyRouter.register,
      { name: 'frontend', publicKeyPem },
      { context: makeAuthedCtx({ db, role: 'admin' }) },
    )
    const now = Math.floor(Date.now() / 1000)
    const expired = signJwt(privateKey, {
      iss: registered.id,
      scope: ['content:write'],
      exp: now - FRONTEND_KEY_CLOCK_SKEW_SECONDS - 1,
    })
    expect(await verifyFrontendJwt(db, expired)).toBeNull()

    const tooLong = signJwt(privateKey, {
      iss: registered.id,
      scope: ['content:write'],
      exp: now + FRONTEND_KEY_MAX_EXP_SECONDS + FRONTEND_KEY_CLOCK_SKEW_SECONDS + 1,
    })
    expect(await verifyFrontendJwt(db, tooLong)).toBeNull()
  })

  it('rejects a missing write scope', async () => {
    const { publicKeyPem, privateKey } = makeKeyPair()
    const registered = await call(
      adminApiKeyRouter.register,
      { name: 'frontend', publicKeyPem },
      { context: makeAuthedCtx({ db, role: 'admin' }) },
    )
    const now = Math.floor(Date.now() / 1000)
    const token = signJwt(privateKey, { iss: registered.id, scope: ['read'], exp: now + 120 })
    expect(await verifyFrontendJwt(db, token)).toBeNull()
  })

  it('rejects a token after the key is revoked', async () => {
    const { publicKeyPem, privateKey } = makeKeyPair()
    const registered = await call(
      adminApiKeyRouter.register,
      { name: 'frontend', publicKeyPem },
      { context: makeAuthedCtx({ db, role: 'admin' }) },
    )
    await call(adminApiKeyRouter.revoke, { id: registered.id }, { context: makeAuthedCtx({ db, role: 'admin' }) })
    const now = Math.floor(Date.now() / 1000)
    const token = signJwt(privateKey, { iss: registered.id, scope: ['content:write'], exp: now + 120 })
    expect(await verifyFrontendJwt(db, token)).toBeNull()
  })

  it('rejects a non-EdDSA algorithm header', async () => {
    const { publicKeyPem, privateKey } = makeKeyPair()
    const registered = await call(
      adminApiKeyRouter.register,
      { name: 'frontend', publicKeyPem },
      { context: makeAuthedCtx({ db, role: 'admin' }) },
    )
    const now = Math.floor(Date.now() / 1000)
    const token = signJwt(
      privateKey,
      { iss: registered.id, scope: ['content:write'], exp: now + 120 },
      { alg: 'RS256', typ: 'JWT' },
    )
    expect(await verifyFrontendJwt(db, token)).toBeNull()
  })
})

describe('frontendKeyAuth middleware projection', () => {
  // Probe procedure carrying the middleware, so the projection is
  // exercised through the real oRPC middleware chain.
  const probe = publicProc
    .route({ method: 'POST', path: '/probe' })
    .use(frontendKeyAuth)
    .handler(async ({ context }) => ({ auth: context.frontendAuth }))

  it('injects frontendAuth behind a valid key and honours X-Forwarded-For', async () => {
    const { publicKeyPem, privateKey } = makeKeyPair()
    const registered = await call(
      adminApiKeyRouter.register,
      { name: 'frontend', publicKeyPem },
      { context: makeAuthedCtx({ db, role: 'admin' }) },
    )
    const now = Math.floor(Date.now() / 1000)
    const token = signJwt(privateKey, { iss: registered.id, scope: ['content:write'], exp: now + 120 })

    const ctx = makeAuthedCtx({ db, role: 'admin' })
    ctx.request = new Request('http://localhost/rpc/probe', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'X-Forwarded-For': '198.51.100.9' },
    })
    const result = await call(probe, {}, { context: ctx })
    expect(result.auth).not.toBeNull()
    expect(result.auth?.keyId).toBe(registered.id)
    expect(result.auth?.forwardedAddress).toBe('198.51.100.9')
  })

  it('leaves frontendAuth null when the token is missing', async () => {
    const ctx = makeAuthedCtx({ db, role: 'admin' })
    ctx.request = new Request('http://localhost/rpc/probe', { method: 'POST' })
    const result = await call(probe, {}, { context: ctx })
    expect(result.auth).toBeNull()
  })
})

describe('frontendKeyAuth trusted forwarding (phase 0.6)', () => {
  // Probe exposing the overridden request facts behind a valid key.
  const forwardProbe = publicProc
    .route({ method: 'POST', path: '/probe-forward' })
    .use(frontendKeyAuth)
    .handler(async ({ context }) => ({ address: context.clientAddress, ua: context.requestFacts.userAgent }))

  // Probe exposing the comment-token jar merge (cookie + header).
  const tokenJarProbe = publicProc
    .route({ method: 'POST', path: '/probe-token-jar' })
    .use(frontendKeyAuth)
    .use(commentTokenCookie)
    .handler(async ({ context }) => ({ pages: Object.keys(context.commentTokens.cookie) }))

  async function registerFrontendKey(name: string): Promise<{ id: string; privateKey: KeyObject }> {
    const { publicKeyPem, privateKey } = makeKeyPair()
    const registered = await call(
      adminApiKeyRouter.register,
      { name, publicKeyPem },
      { context: makeAuthedCtx({ db, role: 'admin' }) },
    )
    return { id: registered.id, privateKey }
  }

  it('overrides clientAddress and userAgent from X-Forwarded-* behind a valid key', async () => {
    const { id, privateKey } = await registerFrontendKey('forward-frontend')
    const token = signJwt(privateKey, { iss: id, scope: ['content:write'], exp: Math.floor(Date.now() / 1000) + 120 })

    const ctx = makeAuthedCtx({ db, role: 'admin' })
    ctx.request = new Request('http://localhost/rpc/probe-forward', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Forwarded-For': '198.51.100.9',
        'X-Forwarded-User-Agent': 'proxy-browser/1.0',
      },
    })
    const result = await call(forwardProbe, {}, { context: ctx })
    expect(result.address).toBe('198.51.100.9')
    expect(result.ua).toBe('proxy-browser/1.0')
  })

  it('keeps the direct transport facts when no forwarding headers ride a valid key', async () => {
    const { id, privateKey } = await registerFrontendKey('plain-frontend')
    const token = signJwt(privateKey, { iss: id, scope: ['content:write'], exp: Math.floor(Date.now() / 1000) + 120 })

    const ctx = makeAuthedCtx({ db, role: 'admin' })
    ctx.request = new Request('http://localhost/rpc/probe-forward', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    const result = await call(forwardProbe, {}, { context: ctx })
    expect(result.address).toBe('127.0.0.1')
    expect(result.ua).toBeNull()
  })

  it('merges the X-Kobato-Comment-Token jar into the cookie jar behind a valid key', async () => {
    const { id, privateKey } = await registerFrontendKey('jar-frontend')
    const token = signJwt(privateKey, { iss: id, scope: ['content:write'], exp: Math.floor(Date.now() / 1000) + 120 })

    const cookieJar = { 'pk-cookie': [{ token: 'tok-cookie', expiresAt: 4_102_444_800 }] }
    const headerJar = { 'pk-header': [{ token: 'tok-header', expiresAt: 4_102_444_800 }] }
    const ctx = makeAuthedCtx({ db, role: 'admin' })
    ctx.request = new Request('http://localhost/rpc/probe-token-jar', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Kobato-Comment-Token': encodeURIComponent(JSON.stringify(headerJar)),
      },
    })
    ctx.requestFacts = {
      ...ctx.requestFacts,
      cookie: `__comment_tokens=${encodeURIComponent(JSON.stringify(cookieJar))}`,
    }
    const result = await call(tokenJarProbe, {}, { context: ctx })
    expect(result.pages).toEqual(['pk-cookie', 'pk-header'])
  })

  it('ignores the header jar on anonymous requests (no JWT)', async () => {
    const headerJar = { 'pk-header': [{ token: 'tok-header', expiresAt: 4_102_444_800 }] }
    const ctx = makeAuthedCtx({ db, role: 'admin' })
    ctx.request = new Request('http://localhost/rpc/probe-token-jar', {
      method: 'POST',
      headers: { 'X-Kobato-Comment-Token': encodeURIComponent(JSON.stringify(headerJar)) },
    })
    const result = await call(tokenJarProbe, {}, { context: ctx })
    expect(result.pages).toEqual([])
  })
})

describe('frontendKeyAuth member session bridge (X-Kobato-Session-Token)', () => {
  // Probe exposing the resolved viewer — the anonymous start state makes
  // the header-borne session visible (with a cookie session the bridge is
  // a no-op by design).
  const sessionProbe = publicProc
    .route({ method: 'POST', path: '/probe-session' })
    .use(frontendKeyAuth)
    .handler(async ({ context }) => ({ viewer: context.viewer }))

  /** Register a key + sign a JWT, returning the bearer header value. */
  async function registerFrontendKeyWithJwt(
    keyPair: { publicKeyPem: string; privateKey: KeyObject },
    name: string,
  ): Promise<string> {
    const registered = await call(
      adminApiKeyRouter.register,
      { name, publicKeyPem: keyPair.publicKeyPem },
      { context: makeAuthedCtx({ db, role: 'admin' }) },
    )
    const now = Math.floor(Date.now() / 1000)
    return signJwt(keyPair.privateKey, { iss: registered.id, scope: ['content:write'], exp: now + 120 })
  }

  async function seedMemberSession(): Promise<string> {
    const [u] = await db
      .insert(user)
      .values({ name: 'Member', email: 'member@example.com', password: 'hashed', role: 'visitor' })
      .returning()
    const session = await getRequestSession(new Request('http://localhost/'))
    const login = await establishLoginSession(db, session, u as never, new Request('http://localhost/'), '127.0.0.1')
    // The raw signed cookie VALUE (what the browser stores / the frontend
    // proxy relays as the header).
    return login.setCookie.split(';')[0]!.slice('__session='.length)
  }

  it('resolves the member session from the header behind a valid key', async () => {
    const { publicKeyPem, privateKey } = makeKeyPair()
    const bearer = await registerFrontendKeyWithJwt({ publicKeyPem, privateKey }, 'session-bridge')
    const cookieValue = await seedMemberSession()

    const ctx = makePublicCtx({ db })
    ctx.request = new Request('http://localhost/rpc/probe-session', {
      method: 'POST',
      headers: { Authorization: `Bearer ${bearer}`, 'X-Kobato-Session-Token': cookieValue },
    })
    const result = await call(sessionProbe, {}, { context: ctx })
    expect(result.viewer?.email).toBe('member@example.com')
    expect(result.viewer?.role).toBe('visitor')
  })

  it('ignores the header without a valid key (anonymous cannot inject a session)', async () => {
    const cookieValue = await seedMemberSession()

    const ctx = makePublicCtx({ db })
    ctx.request = new Request('http://localhost/rpc/probe-session', {
      method: 'POST',
      headers: { 'X-Kobato-Session-Token': cookieValue },
    })
    const result = await call(sessionProbe, {}, { context: ctx })
    expect(result.viewer).toBeNull()
  })

  it('ignores a garbage header behind a valid key (no session row)', async () => {
    const { publicKeyPem, privateKey } = makeKeyPair()
    const bearer = await registerFrontendKeyWithJwt({ publicKeyPem, privateKey }, 'session-bridge-garbage')

    const ctx = makePublicCtx({ db })
    ctx.request = new Request('http://localhost/rpc/probe-session', {
      method: 'POST',
      headers: { Authorization: `Bearer ${bearer}`, 'X-Kobato-Session-Token': 'Im5vdC1hLXNlc3Npb24i.fake-signature' },
    })
    const result = await call(sessionProbe, {}, { context: ctx })
    expect(result.viewer).toBeNull()
  })
})

describe('sdk signer ↔ core verifier round trip', () => {
  it('accepts tokens signed by the SDK signer', async () => {
    const { publicKeyPem, privateKey } = makeKeyPair()
    const { createKeyAuthSigner } = await import('@kobato/sdk/signer')
    const signer = createKeyAuthSigner(privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), 'sdk-key')
    const registered = await call(
      adminApiKeyRouter.register,
      { name: 'sdk-frontend', publicKeyPem },
      { context: makeAuthedCtx({ db, role: 'admin' }) },
    )
    // The SDK signer uses its own key id; register under that id.
    const registeredSdk = await call(
      adminApiKeyRouter.register,
      { name: 'sdk-frontend-2', publicKeyPem },
      { context: makeAuthedCtx({ db, role: 'admin' }) },
    )
    void registered
    const token = signer.sign({ scope: ['content:write'] })
    const payload = JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString('utf8')) as { iss: string }
    // Re-sign with the SDK signer bound to the registered id.
    const sdkSigner = createKeyAuthSigner(
      privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
      registeredSdk.id,
    )
    const finalToken = sdkSigner.sign({ scope: ['content:write'] })
    const verified = await verifyFrontendJwt(db, finalToken)
    expect(verified).not.toBeNull()
    expect(verified?.keyId).toBe(registeredSdk.id)
    void payload
  })
})
