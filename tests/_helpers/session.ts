import { createSession } from 'react-router'

import type { BlogSession, BlogSessionData, SessionUser } from '@/server/domains/auth/session-storage'

// In-memory `BlogSession` doppelganger. `react-router`'s real `Session`
// builds on top of `createSessionStorage`, which the app wires to the
// session table through db-lifecycle. Tests don't need that — they only
// need `.get` / `.set` / `.unset` semantics.
export function makeSession(data: Partial<BlogSessionData> = {}): BlogSession {
  return createSession<BlogSessionData, BlogSessionData>(data, 'test-session')
}

export function adminUser(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    id: '1',
    name: 'admin',
    email: 'admin@example.com',
    website: null,
    role: 'admin',
    ...overrides,
  }
}

export function regularUser(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    id: '2',
    name: 'reader',
    email: 'reader@example.com',
    website: null,
    role: 'visitor',
    ...overrides,
  }
}

export function authorUser(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    id: '3',
    name: 'author',
    email: 'author@example.com',
    website: null,
    role: 'author',
    ...overrides,
  }
}

export function adminSession(): BlogSession {
  return makeSession({ user: adminUser() })
}

export function authorSession(): BlogSession {
  return makeSession({ user: authorUser() })
}

export function regularSession(): BlogSession {
  return makeSession({ user: regularUser() })
}

export function emptySession(): BlogSession {
  return makeSession({})
}
