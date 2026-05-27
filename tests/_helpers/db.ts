import { afterEach, vi } from 'vitest'

import type { Comment, Like, MetricRow, NewComment, NewUser, User } from '@/server/infra/db/types'

afterEach(() => {
  resetSeedIds()
})

// --- High-level: replace a query module's named exports with spies. --------

type QueryModuleSpec<TExports extends Record<string, (...args: never[]) => unknown>> = {
  [K in keyof TExports]: ReturnType<typeof vi.fn>
}

/**
 * Build a typed bag of `vi.fn()` spies that mirrors the exports of a
 * `@/server/infra/db/operations/*.ts` module. Pass the result to
 * `vi.mock("@/server/infra/db/operations/comment", () => mocked)` (or use
 * `installQueryMock` below).
 */
export function spyQueryModule<TExports extends Record<string, (...args: never[]) => unknown>>(
  keys: readonly (keyof TExports)[],
): QueryModuleSpec<TExports> {
  const out = {} as QueryModuleSpec<TExports>
  for (const key of keys) {
    out[key] = vi.fn()
  }
  return out
}

// --- Declarative fixtures for the most common rows ------------------------

let _id = 1n
function nextBigInt(): bigint {
  _id += 1n
  return _id
}
function resetIds(): void {
  _id = 1n
}

export interface CommentFixture extends Partial<Comment> {
  /** User row paired with this comment (for joined `commentWithUser` shape). */
  user?: Partial<User>
}

/**
 * Build a `commentWithUser`-shaped row matching what `findRootComments` /
 * `findChildComments` / `findCommentWithUserById` return. Defaults are
 * intentionally bland so individual tests only override what they care about.
 */
export function seedComment(overrides: CommentFixture = {}) {
  const id = overrides.id ?? nextBigInt()
  const userId = overrides.userId ?? nextBigInt()
  return {
    id,
    createAt: overrides.createdAt ?? new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: overrides.updatedAt ?? new Date('2024-01-01T00:00:00.000Z'),
    deleteAt: overrides.deletedAt ?? null,
    content: overrides.content ?? '<p>hi</p>',
    type: overrides.type ?? 'post',
    ownerId: overrides.ownerId ?? 1n,
    userId,
    isVerified: overrides.isVerified ?? true,
    ua: overrides.ua ?? '',
    ip: overrides.ip ?? '',
    rid: overrides.rid ?? 0,
    isCollapsed: overrides.isCollapsed ?? false,
    isPending: overrides.isPending ?? false,
    isPinned: overrides.isPinned ?? false,
    voteUp: overrides.voteUp ?? 0,
    voteDown: overrides.voteDown ?? 0,
    rootId: overrides.rootId ?? 0n,
    name: overrides.user?.name ?? 'Alice',
    email: overrides.user?.email ?? `user${userId}@example.com`,
    emailVerified: overrides.user?.emailVerified ?? true,
    link: overrides.user?.link ?? '',
    badgeName: overrides.user?.badgeName ?? null,
    badgeColor: overrides.user?.badgeColor ?? null,
    badgeTextColor: overrides.user?.badgeTextColor ?? null,
  }
}

export function seedComments(specs: CommentFixture[]) {
  return specs.map((spec) => seedComment(spec))
}

export function seedUser(overrides: Partial<User> = {}): User {
  return {
    id: overrides.id ?? nextBigInt(),
    name: overrides.name ?? 'Alice',
    email: overrides.email ?? 'alice@example.com',
    emailVerified: overrides.emailVerified ?? true,
    link: overrides.link ?? '',
    role: overrides.role ?? null,
    badgeName: overrides.badgeName ?? null,
    badgeColor: overrides.badgeColor ?? null,
    badgeTextColor: overrides.badgeTextColor ?? null,
    createdAt: overrides.createdAt ?? new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: overrides.updatedAt ?? new Date('2024-01-01T00:00:00.000Z'),
  } as User
}

export function seedUsers(specs: Partial<User>[] = []): User[] {
  return specs.map((spec) => seedUser(spec))
}

export function seedLike(overrides: Partial<Like> = {}): Like {
  const now = overrides.createdAt ?? new Date('2024-01-01T00:00:00.000Z')
  return {
    id: overrides.id ?? nextBigInt(),
    token: overrides.token ?? 'token',
    type: overrides.type ?? 'post',
    ownerId: overrides.ownerId ?? 1n,
    createdAt: now,
    updatedAt: overrides.updatedAt ?? now,
    deletedAt: overrides.deletedAt ?? null,
  } as Like
}

export function seedLikes(specs: Partial<Like>[]): Like[] {
  return specs.map((spec) => seedLike(spec))
}

export function seedMetric(overrides: Partial<MetricRow> = {}): MetricRow {
  const now = overrides.createdAt ?? new Date('2024-01-01T00:00:00.000Z')
  return {
    id: overrides.id ?? nextBigInt(),
    type: overrides.type ?? 'post',
    ownerId: overrides.ownerId ?? 1n,
    publicId: overrides.publicId ?? '00000000-0000-0000-0000-000000000001',
    pv: overrides.pv ?? 0,
    voteUp: overrides.voteUp ?? 0,
    voteDown: overrides.voteDown ?? 0,
    createdAt: now,
    updatedAt: overrides.updatedAt ?? now,
    deletedAt: overrides.deletedAt ?? null,
  } as MetricRow
}

// Re-export NewUser/NewComment so a test can import the seed helpers and
// new-row types from a single place.
export type { NewComment, NewUser }

/** Reset the auto-increment id counter — call between tests for stability. */
export function resetSeedIds(): void {
  resetIds()
}
