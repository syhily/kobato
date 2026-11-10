import type { HandlerContext } from '@/server/http/orpc-base'
import type { Database } from '@/server/infra/db/database'
import type { BlogSettingsBundle } from '@/shared/config/types'
import type { AppLocalization } from '@/shared/i18n/app-localization'

import { extractRequestFacts } from '@/server/http/utils/request-facts'
import { createLazyAppSnapshot } from '@/shared/i18n/app-localization'

// Builders for the oRPC `context` argument. Authed procedures gate on `context.viewer`
// via requireAuth/requireRole, so the viewer and session stub are both seeded.

export interface MockCtxOptions {
  userId?: string
  role?: 'admin' | 'author' | 'visitor'
  sessionId?: string
  clientAddress?: string
  url?: string
  /** Raw `Cookie` header — lands in `requestFacts.cookie`. */
  cookie?: string
  /** CSRF token the session stub answers for the `csrfToken` key. */
  csrfToken?: string
  db?: Database
  /** Explicit request-localization projection (partial: missing fields come from the lazy capture). */
  localization?: LocalizationOverride
  /** Explicit pinned settings bundle; omitted means the lazy snapshot capture. */
  settings?: BlogSettingsBundle | null
}

/** Test-only partial projection: missing representation fields come from the lazy capture. */
type LocalizationOverride = Pick<AppLocalization, 'locale' | 'timeZone'> &
  Partial<Pick<AppLocalization, 'timeFormat' | 'revision' | 'revisions'>>

function makeSessionStub(user: { id: string; role: string } | undefined, sessionId: string, csrfToken?: string) {
  // Minimal `BlogSession` surface — only the methods orpc-base actually calls.
  return {
    id: sessionId,
    get: (key: string) => {
      if (key === 'user') {
        return user
      }
      if (key === 'csrfToken') {
        return csrfToken
      }
      return undefined
    },
    set: () => undefined,
    unset: () => undefined,
    flash: () => undefined,
  } as unknown as HandlerContext['session']
}

export function makeAuthedCtx(opts: MockCtxOptions = {}): HandlerContext {
  const userId = opts.userId ?? '1'
  const role = opts.role ?? 'admin'
  const request = new Request(
    opts.url ?? 'http://localhost/rpc',
    opts.cookie === undefined ? undefined : { headers: { Cookie: opts.cookie } },
  )
  // Lazy pair: a HandlerContext built before the snapshot hydrates must not
  // pin the pre-hydration defaults.
  const lazySnapshot = createLazyAppSnapshot()
  return {
    request,
    requestFacts: extractRequestFacts(request),
    session: makeSessionStub({ id: userId, role }, opts.sessionId ?? 'session-1', opts.csrfToken),
    viewer: { id: userId, name: 'Test User', email: 'test@example.com', website: null, role },
    clientAddress: opts.clientAddress ?? '127.0.0.1',
    responseHeaders: new Headers(),
    db: opts.db ?? ({} as Database),
    get settings() {
      return opts.settings === undefined ? lazySnapshot().settings : opts.settings
    },
    get localization() {
      if (opts.localization === undefined) {
        return lazySnapshot().localization
      }
      const captured = lazySnapshot().localization
      return {
        locale: opts.localization.locale,
        timeZone: opts.localization.timeZone,
        timeFormat: opts.localization.timeFormat ?? null,
        revision: opts.localization.revision ?? captured.revision,
        revisions: opts.localization.revisions ?? captured.revisions,
      }
    },
  }
}

export function makePublicCtx(opts: MockCtxOptions = {}): HandlerContext {
  const request = new Request(
    opts.url ?? 'http://localhost/rpc',
    opts.cookie === undefined ? undefined : { headers: { Cookie: opts.cookie } },
  )
  const lazySnapshot = createLazyAppSnapshot()
  return {
    request,
    requestFacts: extractRequestFacts(request),
    session: makeSessionStub(undefined, opts.sessionId ?? 'session-1', opts.csrfToken),
    viewer: null,
    clientAddress: opts.clientAddress ?? '127.0.0.1',
    responseHeaders: new Headers(),
    db: opts.db ?? ({} as Database),
    get settings() {
      return opts.settings === undefined ? lazySnapshot().settings : opts.settings
    },
    get localization() {
      if (opts.localization === undefined) {
        return lazySnapshot().localization
      }
      const captured = lazySnapshot().localization
      return {
        locale: opts.localization.locale,
        timeZone: opts.localization.timeZone,
        timeFormat: opts.localization.timeFormat ?? null,
        revision: opts.localization.revision ?? captured.revision,
        revisions: opts.localization.revisions ?? captured.revisions,
      }
    },
  }
}
