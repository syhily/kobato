import type { Database } from '@kobato/db/database'
import type { HandlerContext } from '@kobato/server/http/orpc-base'
import type { AppLocalization } from '@kobato/settings/app-localization'
import type { BlogSettingsBundle } from '@kobato/settings/types'

import { extractRequestFacts } from '@kobato/server/http/request/request-facts'
import { createLazyAppSnapshot } from '@kobato/settings/app-localization'

export interface MockCtxOptions {
  userId?: string
  role?: 'admin' | 'author' | 'visitor'
  sessionId?: string
  clientAddress?: string
  url?: string
  cookie?: string
  csrfToken?: string
  db?: Database
  localization?: LocalizationOverride
  settings?: BlogSettingsBundle | null
}

type LocalizationOverride = Pick<AppLocalization, 'locale' | 'timeZone'> &
  Partial<Pick<AppLocalization, 'timeFormat' | 'revision' | 'revisions'>>

function makeSessionStub(user: { id: string; role: string } | undefined, sessionId: string, csrfToken?: string) {
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
