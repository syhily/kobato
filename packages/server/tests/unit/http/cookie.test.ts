import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Cookie config drives every authenticated user's browser; even a quiet
// regression (e.g. flipping `httpOnly` to false, dropping `sameSite`) would
// silently widen the attack surface. We pin the source so any change is a
// PR-visible diff.
const sessionFile = resolve(process.cwd(), 'packages/server/src/domains/auth/session-storage.ts')
const source = readFileSync(sessionFile, 'utf8')
// The cookie NAME is the session-bridge contract shared with the frontend
// (proxy relay + handoff mirror) — it lives in the shared package.
const bridgeFile = resolve(process.cwd(), 'packages/shared/src/http/session-bridge.ts')
const bridgeSource = readFileSync(bridgeFile, 'utf8')

describe('contract: session cookie configuration', () => {
  it('uses the historical session cookie name (__session)', () => {
    expect(source).toContain('name: SESSION_COOKIE_NAME')
    // The constant itself moved to the shared session-bridge contract
    // (both domains must agree on the name).
    expect(bridgeSource).toContain("SESSION_COOKIE_NAME = '__session'")
  })

  it("keeps the cookie httpOnly so client-side JS can't read it", () => {
    expect(source).toContain('httpOnly: true')
  })

  it('locks SameSite to lax (no third-party CSRF, but normal nav works)', () => {
    expect(source).toContain("sameSite: 'lax'")
  })

  it('scopes the cookie to / (whole site)', () => {
    expect(source).toContain("path: '/'")
  })

  it('flips secure based on PROD (no Secure in dev so localhost works)', () => {
    expect(source).toContain('secure: import.meta.env.PROD')
  })

  it('uses the session secret from the config module (never a hard-coded literal)', () => {
    expect(source).toContain('secrets: serverConfig.security.sessionSecret')
    expect(source).not.toMatch(/secrets: \[/)
  })
})
