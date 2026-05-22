import { and, count, desc, eq, gte, ilike, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm'

import type { EntityTarget, EntityType } from '@/server/infra/db/target'
import type { Comment, NewComment } from '@/server/infra/db/types'
import type { MyCommentsStatus } from '@/shared/types/comments'

export type { MyCommentsStatus }

import { db } from '@/server/infra/db/pool'
import { comment, metric, page, post, user } from '@/server/infra/db/schema'
import { escapeLikePattern } from '@/shared/utils/escape-like'
import { idFromString } from '@/shared/utils/id'

// Common projection: every comment column we expose to the application,
// joined with the public user attributes. Keep the shape stable here so the
// CommentAndUser DTO upstream stays in sync via TypeScript inference.
const commentWithUser = {
  id: comment.id,
  createAt: comment.createdAt,
  updatedAt: comment.updatedAt,
  deleteAt: comment.deletedAt,
  content: comment.content,
  body: comment.body,
  type: comment.type,
  ownerId: comment.ownerId,
  userId: comment.userId,
  isVerified: comment.isVerified,
  ua: comment.ua,
  ip: comment.ip,
  rid: comment.rid,
  isCollapsed: comment.isCollapsed,
  isPending: comment.isPending,
  isPinned: comment.isPinned,
  voteUp: comment.voteUp,
  voteDown: comment.voteDown,
  rootId: comment.rootId,
  deleteRequestedAt: comment.deleteRequestedAt,
  deleteRequestedBy: comment.deleteRequestedBy,
  name: user.name,
  email: user.email,
  emailVerified: user.emailVerified,
  link: user.link,
  badgeName: user.badgeName,
  badgeColor: user.badgeColor,
  badgeTextColor: user.badgeTextColor,
}

// Pure type derived from the projection above via Drizzle's column-shape
// inference. Re-exported by `services/comments/types.ts` so downstream
// non-server code can refer to it without importing this `.server.ts`
// module directly. Inferring from the projection keeps the DTO and the
// SQL projection in lockstep — adding or removing a column from
// `commentWithUser` propagates to consumers automatically.
export type CommentWithUser = {
  [K in keyof typeof commentWithUser]: (typeof commentWithUser)[K]['_']['notNull'] extends true
    ? (typeof commentWithUser)[K]['_']['data']
    : (typeof commentWithUser)[K]['_']['data'] | null
}

function whereTarget(target: EntityTarget) {
  return and(eq(comment.type, target.type), eq(comment.ownerId, target.ownerId))
}

export interface PendingCommentRow {
  id: bigint
  type: EntityType
  ownerId: bigint
  slug: string | null
  title: string | null
  author: string | null
  authorLink: string | null
}

// Post + page UNION used by `pendingComments` / `commentsByIds` and any
// admin surface that wants to project `(type, owner_id)` back to a
// human-readable slug + title without a polymorphic JOIN.
function targetSlugTitleSubquery() {
  return db
    .select({
      type: sql<EntityType>`'post'`.as('type'),
      ownerId: post.id,
      slug: post.slug,
      title: post.title,
    })
    .from(post)
    .unionAll(
      db
        .select({
          type: sql<EntityType>`'page'`.as('type'),
          ownerId: page.id,
          slug: page.slug,
          title: page.title,
        })
        .from(page),
    )
    .as('entity')
}

export async function pendingComments(limit: number): Promise<PendingCommentRow[]> {
  const entity = targetSlugTitleSubquery()
  const rows = await db
    .select({
      id: comment.id,
      type: comment.type,
      ownerId: comment.ownerId,
      slug: entity.slug,
      title: entity.title,
      author: user.name,
      authorLink: user.link,
    })
    .from(comment)
    .innerJoin(user, eq(comment.userId, user.id))
    .leftJoin(entity, and(eq(entity.type, comment.type), eq(entity.ownerId, comment.ownerId)))
    .where(eq(comment.isPending, true))
    .orderBy(desc(comment.id))
    .limit(limit)
  return rows
    .filter((r) => r.type !== null && r.ownerId !== null)
    .map((r) => ({
      id: r.id,
      type: r.type as EntityType,
      ownerId: r.ownerId as bigint,
      slug: r.slug,
      title: r.title,
      author: r.author,
      authorLink: r.authorLink,
    }))
}

export async function adminUserIds(): Promise<bigint[]> {
  const rows = await db.select({ id: user.id }).from(user).where(eq(user.role, 'admin'))
  return rows.map((r) => r.id)
}

export async function latestDistinctCommentIds(adminIds: bigint[], limit: number): Promise<bigint[]> {
  // Build a properly parameterized "exclude admins" predicate. Using
  // `sql.join` keeps each id as a bound parameter instead of dropping the
  // raw values into the query string.
  const userFilter = adminIds.length > 0 ? sql`${comment.userId} NOT IN (${sql.join(adminIds, sql`, `)})` : sql`1 = 1`
  const query = sql`SELECT    id
  FROM      (
            SELECT    id,
                      user_id,
                      created_at,
                      ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC, id DESC) AS rn
            FROM      ${comment}
            WHERE     is_pending = false
                AND   deleted_at IS NULL
                AND   ${userFilter}
            )         t
  WHERE     rn = 1
  ORDER BY  created_at DESC
  LIMIT     ${limit}`
  const result = await db.execute(query)
  return result.rows.map((row) => idFromString(String((row as { id: unknown }).id)))
}

export async function commentsByIds(ids: bigint[], limit: number): Promise<PendingCommentRow[]> {
  if (ids.length === 0) {
    return []
  }
  const entity = targetSlugTitleSubquery()
  const rows = await db
    .select({
      id: comment.id,
      type: comment.type,
      ownerId: comment.ownerId,
      slug: entity.slug,
      title: entity.title,
      author: user.name,
      authorLink: user.link,
    })
    .from(comment)
    .innerJoin(user, eq(comment.userId, user.id))
    .leftJoin(entity, and(eq(entity.type, comment.type), eq(entity.ownerId, comment.ownerId)))
    .where(inArray(comment.id, ids))
    .orderBy(desc(comment.id))
    .limit(limit)
  return rows
    .filter((r) => r.type !== null && r.ownerId !== null)
    .map((r) => ({
      id: r.id,
      type: r.type as EntityType,
      ownerId: r.ownerId as bigint,
      slug: r.slug,
      title: r.title,
      author: r.author,
      authorLink: r.authorLink,
    }))
}

// Computes both totals in a single round-trip using a filtered aggregate so
// loaders don't issue two near-identical queries on every comment render.
export async function countCommentsAndRoots(
  target: EntityTarget,
  pendingValues: boolean[],
  currentUserId?: bigint,
): Promise<{ total: number; roots: number }> {
  const baseConditions = [
    whereTarget(target),
    or(
      and(inArray(comment.isPending, pendingValues), isNull(comment.deleteRequestedAt)),
      currentUserId !== undefined
        ? and(eq(comment.userId, currentUserId), or(eq(comment.isPending, true), isNotNull(comment.deleteRequestedAt)))
        : sql`1 = 0`,
    ),
  ]
  const rows = await db
    .select({
      total: count(),
      roots: sql<number>`COUNT(*) FILTER (WHERE ${comment.rootId} = 0)`,
    })
    .from(comment)
    .where(and(...baseConditions))
  const row = rows[0]
  return { total: Number(row.total), roots: Number(row.roots) }
}

export async function findRootComments(
  target: EntityTarget,
  pendingValues: boolean[],
  offset: number,
  limit: number,
  currentUserId?: bigint,
) {
  const baseConditions = [
    whereTarget(target),
    eq(comment.rootId, 0n),
    or(
      and(inArray(comment.isPending, pendingValues), isNull(comment.deleteRequestedAt)),
      currentUserId !== undefined
        ? and(eq(comment.userId, currentUserId), or(eq(comment.isPending, true), isNotNull(comment.deleteRequestedAt)))
        : sql`1 = 0`,
    ),
  ]
  return db
    .select(commentWithUser)
    .from(comment)
    .innerJoin(user, eq(comment.userId, user.id))
    .where(and(...baseConditions))
    .limit(limit)
    .orderBy(desc(comment.createdAt), desc(comment.id))
    .offset(offset)
}

export async function findChildComments(
  target: EntityTarget,
  pendingValues: boolean[],
  rootIds: bigint[],
  currentUserId?: bigint,
) {
  if (rootIds.length === 0) {
    return []
  }
  const baseConditions = [
    whereTarget(target),
    inArray(comment.rootId, rootIds),
    or(
      and(inArray(comment.isPending, pendingValues), isNull(comment.deleteRequestedAt)),
      currentUserId !== undefined
        ? and(eq(comment.userId, currentUserId), or(eq(comment.isPending, true), isNotNull(comment.deleteRequestedAt)))
        : sql`1 = 0`,
    ),
  ]
  return db
    .select(commentWithUser)
    .from(comment)
    .innerJoin(user, eq(comment.userId, user.id))
    .where(and(...baseConditions))
}

export async function approveCommentById(id: bigint): Promise<void> {
  await db.update(comment).set({ isPending: false }).where(eq(comment.id, id))
}

export async function findCommentWithUserAndTarget(id: bigint) {
  const entity = targetSlugTitleSubquery()
  const rows = await db
    .select({
      comment,
      user,
      metric,
      entitySlug: entity.slug,
      entityTitle: entity.title,
    })
    .from(comment)
    .innerJoin(user, eq(comment.userId, user.id))
    .innerJoin(metric, and(eq(metric.type, comment.type), eq(metric.ownerId, comment.ownerId)))
    .leftJoin(entity, and(eq(entity.type, comment.type), eq(entity.ownerId, comment.ownerId)))
    .where(eq(comment.id, id))
    .limit(1)
  return rows[0] ?? null
}

export async function deleteCommentById(id: bigint): Promise<void> {
  await db.delete(comment).where(eq(comment.id, id))
}

export async function findCommentRootId(id: bigint): Promise<bigint | null> {
  const rows = await db.select({ rootId: comment.rootId }).from(comment).where(eq(comment.id, id)).limit(1)
  return rows[0]?.rootId ?? null
}

export async function countApprovedCommentsByUser(userId: bigint): Promise<number> {
  const rows = await db
    .select({ count: count() })
    .from(comment)
    .where(and(eq(comment.userId, userId), eq(comment.isPending, false)))
  return rows.length > 0 ? rows[0].count : 0
}

export async function recentCommentsForUserDedupe(userId: bigint, since: Date, limit: number) {
  // Scope the dedupe lookback to a single author so two unrelated commenters
  // posting "+1" minutes apart don't collide, and so a heavy commenter is
  // never blocked from intentionally repeating an older message they
  // themselves wrote outside the window. The legacy implementation queried
  // the 10 most-recent comments globally, which both over- and under-blocked.
  return db
    .select({ content: comment.content })
    .from(comment)
    .where(and(eq(comment.userId, userId), gte(comment.createdAt, since)))
    .orderBy(desc(comment.createdAt), desc(comment.id))
    .limit(limit)
}

export async function insertComment(values: NewComment): Promise<Comment | null> {
  const res = await db.insert(comment).values(values).returning()
  return res[0] ?? null
}

export async function findCommentWithUserById(id: bigint) {
  const rows = await db
    .select(commentWithUser)
    .from(comment)
    .innerJoin(user, eq(comment.userId, user.id))
    .where(eq(comment.id, id))
    .limit(1)
  return rows[0] ?? null
}

export async function updateCommentContent(id: bigint, content: string): Promise<void> {
  await db.update(comment).set({ content }).where(eq(comment.id, id))
}

export async function softDeleteCommentById(id: bigint): Promise<void> {
  await db.update(comment).set({ deletedAt: new Date() }).where(eq(comment.id, id))
}

export async function updateCommentBodyAndContent(
  id: bigint,
  body: NewComment['body'],
  content: string,
): Promise<void> {
  await db.update(comment).set({ body, content }).where(eq(comment.id, id))
}

// Fresh-edit variant of `comment.updateOwn`: an owner editing their own
// comment within the grace window (see `updateOwnComment` in
// `@/server/domains/comments/moderation`) gets to rewrite the PortableText body and
// its markdown projection in place, bumping `updated_at` but NOT
// flipping `is_pending`. The comment stays in whatever moderation
// state it was already in, and the admin notification is skipped.
export async function updateOwnCommentBody(id: bigint, body: NewComment['body'], content: string): Promise<void> {
  await db.update(comment).set({ body, content, updatedAt: new Date() }).where(eq(comment.id, id))
}

// Re-pend variant of `comment.updateOwn`: when an owner edits their own
// comment OUTSIDE the grace window, in addition to rewriting the
// PortableText body and its markdown projection, flip the comment back
// into the moderation queue (`is_pending = true`) and bump
// `updated_at`. The admin-side edit path keeps using
// `updateCommentBodyAndContent` so a moderator's edit does not
// re-queue an already-approved comment.
export async function updateOwnCommentBodyAndPending(
  id: bigint,
  body: NewComment['body'],
  content: string,
): Promise<void> {
  await db.update(comment).set({ body, content, isPending: true, updatedAt: new Date() }).where(eq(comment.id, id))
}

export async function findCommentWithSourceUser(id: bigint) {
  const rows = await db
    .select()
    .from(comment)
    .innerJoin(user, eq(comment.userId, user.id))
    .where(eq(comment.id, id))
    .limit(1)
  return rows[0] ?? null
}

export async function findCommentsByIds(ids: bigint[]) {
  if (ids.length === 0) {
    return []
  }
  return db
    .select(commentWithUser)
    .from(comment)
    .innerJoin(user, eq(comment.userId, user.id))
    .where(inArray(comment.id, ids))
}

export interface PageOption {
  /** `metric.public_id`. Wire field is named `key` because the Combobox API stays stable. */
  key: string
  title: string
}

// Page-title autocomplete for the comment-moderation filter Combobox.
// `q` is matched case-insensitively against the entity's live title
// (joined from `post` / `page`). Empty `q` returns the most recently-
// touched entities so the dropdown can show a sensible default the
// moment the user opens it. `publicIds` is the "rehydrate selection
// from URL" path: when the admin opened
// `/admin/comments?pageKey=<uuid>` we already know which metric row
// to pin, but need its `title` to render in the trigger.
export async function searchPages(q: string | undefined, limit: number, publicIds?: string[]): Promise<PageOption[]> {
  const entity = targetSlugTitleSubquery()
  const conditions = [isNull(metric.deletedAt), isNotNull(metric.type), isNotNull(metric.ownerId)]
  if (publicIds && publicIds.length > 0) {
    conditions.push(inArray(metric.publicId, publicIds))
  } else if (q) {
    conditions.push(ilike(entity.title, `%${escapeLikePattern(q)}%`))
  }
  const rows = await db
    .select({ key: metric.publicId, title: entity.title })
    .from(metric)
    .innerJoin(entity, and(eq(entity.type, metric.type), eq(entity.ownerId, metric.ownerId)))
    .where(and(...conditions))
    .orderBy(desc(metric.id))
    .limit(limit)
  return rows.map((r) => ({ key: r.key, title: r.title ?? '无标题' }))
}

export interface CommentAuthor {
  id: bigint
  name: string
}

// Comment-author autocomplete. We restrict to authors who have at least
// one non-deleted comment (same predicate as the original
// `listCommentAuthors`) so the dropdown only ever surfaces names the
// admin actually has comments to filter by. `q` matches against
// `user.name` case-insensitively. When `ids` is supplied we instead do
// an exact id-match — this is the "rehydrate selection from URL" path
// where the client only knows the user id (e.g. from `?userId=2232`)
// and needs the matching `name` to render in the Combobox trigger.
export async function searchCommentAuthors(
  q: string | undefined,
  limit: number,
  ids?: bigint[],
): Promise<CommentAuthor[]> {
  const conditions = [isNull(comment.deletedAt)]
  if (ids && ids.length > 0) {
    conditions.push(inArray(user.id, ids))
  } else if (q) {
    conditions.push(ilike(user.name, `%${escapeLikePattern(q)}%`))
  }
  return db
    .selectDistinct({ id: user.id, name: user.name })
    .from(comment)
    .innerJoin(user, eq(comment.userId, user.id))
    .where(and(...conditions))
    .orderBy(user.id)
    .limit(limit)
}

export interface AdminListFilters {
  target?: EntityTarget
  userId?: bigint
  status?: 'all' | 'pending' | 'approved'
}

function buildAdminListConditions(filters: AdminListFilters) {
  const conditions = [isNull(comment.deletedAt)]
  if (filters.target) {
    conditions.push(eq(comment.type, filters.target.type), eq(comment.ownerId, filters.target.ownerId))
  }
  if (filters.userId) {
    conditions.push(eq(comment.userId, filters.userId))
  }
  if (filters.status === 'pending') {
    conditions.push(eq(comment.isPending, true))
  }
  if (filters.status === 'approved') {
    conditions.push(eq(comment.isPending, false))
  }
  return conditions
}

export async function countAllComments(filters: AdminListFilters): Promise<number> {
  const conditions = buildAdminListConditions(filters)
  const rows = await db
    .select({ counts: count() })
    .from(comment)
    .where(and(...conditions))
  return rows[0].counts
}

export async function listAdminComments(offset: number, limit: number, filters: AdminListFilters) {
  const conditions = buildAdminListConditions(filters)
  const entity = targetSlugTitleSubquery()
  return db
    .select({ ...commentWithUser, pageTitle: entity.title, pagePublicId: metric.publicId })
    .from(comment)
    .innerJoin(user, eq(comment.userId, user.id))
    .leftJoin(entity, and(eq(entity.type, comment.type), eq(entity.ownerId, comment.ownerId)))
    .leftJoin(metric, and(eq(metric.type, comment.type), eq(metric.ownerId, comment.ownerId)))
    .where(and(...conditions))
    .orderBy(desc(comment.createdAt))
    .limit(limit)
    .offset(offset)
}

// Welcome-dashboard pending queue. Rolls TWO concerns into a single
// list so the admin landing page can offer a unified inbox:
//
//   - `approval`: `is_pending = true` AND no delete request — newly
//                 posted (first-time author) OR re-pended after an
//                 author edit. Approve / reject buttons act on these.
//   - `deletion`: `delete_requested_at IS NOT NULL` — the author asked
//                 to remove their own row and the admin still has to
//                 accept or refuse. Accept / refuse buttons act on
//                 these.
//
// A row that's both pending-approval AND has a delete request reports as
// `deletion` because that's the more urgent state.
export type AdminPendingKind = 'all' | 'approval' | 'deletion'

function adminPendingWhere(kind: AdminPendingKind) {
  const live = isNull(comment.deletedAt)
  if (kind === 'approval') {
    return and(live, eq(comment.isPending, true), isNull(comment.deleteRequestedAt))
  }
  if (kind === 'deletion') {
    return and(live, isNotNull(comment.deleteRequestedAt))
  }
  return and(live, or(eq(comment.isPending, true), isNotNull(comment.deleteRequestedAt)))
}

export interface AdminPendingRow {
  id: bigint
  createdAt: Date
  deleteRequestedAt: Date | null
  // Mirrors the DB column nullability — `comment.is_pending` is
  // declared nullable so legacy seed rows could be backfilled.
  isPending: boolean | null
  content: string | null
  type: EntityType | null
  ownerId: bigint | null
  pageSlug: string | null
  pageTitle: string | null
  authorName: string
  authorLink: string | null
}

export async function listAdminPendingDashboard(
  kind: AdminPendingKind,
  offset: number,
  limit: number,
): Promise<AdminPendingRow[]> {
  const entity = targetSlugTitleSubquery()
  const rows = await db
    .select({
      id: comment.id,
      createdAt: comment.createdAt,
      deleteRequestedAt: comment.deleteRequestedAt,
      isPending: comment.isPending,
      content: comment.content,
      type: comment.type,
      ownerId: comment.ownerId,
      pageSlug: entity.slug,
      pageTitle: entity.title,
      authorName: user.name,
      authorLink: user.link,
    })
    .from(comment)
    .innerJoin(user, eq(comment.userId, user.id))
    .leftJoin(entity, and(eq(entity.type, comment.type), eq(entity.ownerId, comment.ownerId)))
    .where(adminPendingWhere(kind))
    // Order by the most-recent activity: delete-request time when set,
    // otherwise the comment's createdAt. Pushes fresh moderation work to
    // the top regardless of which queue surfaced it.
    .orderBy(desc(sql`COALESCE(${comment.deleteRequestedAt}, ${comment.createdAt})`), desc(comment.id))
    .limit(limit)
    .offset(offset)
  return rows.map((row) => ({
    id: row.id,
    createdAt: row.createdAt,
    deleteRequestedAt: row.deleteRequestedAt,
    isPending: row.isPending,
    content: row.content,
    type: row.type,
    ownerId: row.ownerId,
    pageSlug: row.pageSlug,
    pageTitle: row.pageTitle,
    authorName: row.authorName,
    authorLink: row.authorLink,
  }))
}

export async function countAdminPendingDashboard(): Promise<{ all: number; approval: number; deletion: number }> {
  // One filtered aggregate beats three round-trips. The two `FILTER`
  // clauses use the same conventions as `countMyComments` and stay in
  // lockstep with `adminPendingWhere` above (live rows only, deletion
  // dominates the union).
  const rows = await db
    .select({
      all: sql<number>`COUNT(*) FILTER (WHERE ${comment.deletedAt} IS NULL AND (${comment.isPending} = TRUE OR ${comment.deleteRequestedAt} IS NOT NULL))`,
      approval: sql<number>`COUNT(*) FILTER (WHERE ${comment.deletedAt} IS NULL AND ${comment.isPending} = TRUE AND ${comment.deleteRequestedAt} IS NULL)`,
      deletion: sql<number>`COUNT(*) FILTER (WHERE ${comment.deletedAt} IS NULL AND ${comment.deleteRequestedAt} IS NOT NULL)`,
    })
    .from(comment)
  return {
    all: Number(rows[0]?.all ?? 0),
    approval: Number(rows[0]?.approval ?? 0),
    deletion: Number(rows[0]?.deletion ?? 0),
  }
}

export async function bulkApprovePendingByUser(userId: bigint): Promise<number> {
  // Returns the number of pending comments that were just approved.
  const updated = await db
    .update(comment)
    .set({ isPending: false })
    .where(and(eq(comment.userId, userId), eq(comment.isPending, true), isNull(comment.deletedAt)))
    .returning({ id: comment.id })
  return updated.length
}

export async function bulkSoftDeleteCommentsByUser(userId: bigint): Promise<number> {
  // Soft-deletion mirrors the per-row delete used by the existing admin
  // page. We avoid the hard `DELETE` so moderation actions remain
  // recoverable and downstream like-counts stay consistent.
  const updated = await db
    .update(comment)
    .set({ deletedAt: new Date() })
    .where(and(eq(comment.userId, userId), isNull(comment.deletedAt)))
    .returning({ id: comment.id })
  return updated.length
}

export async function requestDeleteComment(id: bigint, userId: bigint): Promise<void> {
  await db
    .update(comment)
    .set({ deleteRequestedAt: new Date(), deleteRequestedBy: userId })
    .where(and(eq(comment.id, id), isNull(comment.deletedAt)))
}

export async function clearDeleteRequest(id: bigint, userId: bigint): Promise<boolean> {
  const updated = await db
    .update(comment)
    .set({ deleteRequestedAt: null, deleteRequestedBy: null })
    .where(
      and(
        eq(comment.id, id),
        eq(comment.deleteRequestedBy, userId),
        isNull(comment.deletedAt),
        isNotNull(comment.deleteRequestedAt),
      ),
    )
    .returning({ id: comment.id })
  return updated.length > 0
}

/**
 * Admin-side variant of {@link clearDeleteRequest}: clears the pending
 * delete request regardless of who originated it. Used by the
 * "reject delete request" admin action.
 */
export async function adminClearDeleteRequest(id: bigint): Promise<boolean> {
  const updated = await db
    .update(comment)
    .set({ deleteRequestedAt: null, deleteRequestedBy: null })
    .where(and(eq(comment.id, id), isNotNull(comment.deleteRequestedAt)))
    .returning({ id: comment.id })
  return updated.length > 0
}

export async function countApprovedRepliesOfComment(commentId: bigint): Promise<number> {
  const rows = await db
    .select({ count: count() })
    .from(comment)
    .where(and(eq(comment.rid, Number(commentId)), eq(comment.isPending, false), isNull(comment.deletedAt)))
  return rows[0]?.count ?? 0
}

// Comments soft-deleted within this many milliseconds remain visible
// in `/my/*` so the user can see what was removed (with a「已删除」
// badge) before the row drops off entirely. Shared between
// `listMyComments` and `countMyComments` — drift here previously
// caused `hasMore = offset + comments.length < counts.total` to
// underestimate the total and either truncate the last page or hide a
// "load more" button mid-list (see RBAC-REVIEW §O7).
const MY_COMMENTS_SOFT_DELETE_GRACE_MS = 7 * 24 * 60 * 60 * 1000
function mineVisibleClause(userId: bigint) {
  return and(
    eq(comment.userId, userId),
    or(isNull(comment.deletedAt), gte(comment.deletedAt, new Date(Date.now() - MY_COMMENTS_SOFT_DELETE_GRACE_MS))),
  )
}

export interface MyCommentsFilters {
  status?: MyCommentsStatus
  q?: string
  /**
   * Narrow the result to a specific post / page the user has commented
   * on. URL-driven via `?entity=<type>:<ownerId>` on `/admin/me/comments`.
   */
  entity?: { type: EntityType; ownerId: bigint }
}

// Single source of truth for the visitor-self-service query predicate.
// Wraps `mineVisibleClause` so the soft-delete grace window stays in
// lockstep across list/count, and adds the optional tab-status / text
// filters. Keep the first line literally `mineVisibleClause(userId)`
// so the contract test in `tests/service.my-comments.test.ts` can still
// grep for the shared visibility helper inside this function body.
function mineWhere(userId: bigint, filters: MyCommentsFilters = {}) {
  const clauses = [mineVisibleClause(userId)]
  if (filters.status === 'pending') {
    clauses.push(eq(comment.isPending, true))
  } else if (filters.status === 'deleteRequested') {
    clauses.push(isNotNull(comment.deleteRequestedAt))
  } else if (filters.status === 'deleted') {
    clauses.push(isNotNull(comment.deletedAt))
  }
  if (filters.entity) {
    clauses.push(eq(comment.type, filters.entity.type))
    clauses.push(eq(comment.ownerId, filters.entity.ownerId))
  }
  if (filters.q && filters.q.trim() !== '') {
    // ILIKE against the markdown snapshot column `comment.content`
    // (already a plain-text rollback of the PortableText body), so the
    // search hits the same words the user sees rendered. Drizzle
    // parameterises the bound literal so the `%pattern%` interpolation
    // is not a SQL-injection vector; the per-user row volume is
    // bounded by the soft-delete window, so a sequential filter is
    // acceptable here.
    clauses.push(sql`${comment.content} ILIKE ${`%${escapeLikePattern(filters.q.trim())}%`}`)
  }
  return and(...clauses)
}

export async function listMyComments(
  userId: bigint,
  offset: number,
  limit: number,
  filters: MyCommentsFilters = {},
): Promise<CommentWithUser[]> {
  return db
    .select(commentWithUser)
    .from(comment)
    .innerJoin(user, eq(comment.userId, user.id))
    .where(mineWhere(userId, filters))
    .orderBy(desc(comment.createdAt))
    .limit(limit)
    .offset(offset)
}

// Batch helper: project the unique `(type, ownerId)` tuples that appear
// in a `listMyComments` page back to a `{ type, slug, title }` triple
// via the same post + page UNION used by the moderation widget. Keyed
// by `${type}:${ownerId}` so the caller can look up rows without a
// second per-row query. Returns one entry per existing entity — a
// missing entry means the underlying post / page row was deleted.
export interface EntitySlugTitle {
  type: EntityType
  slug: string
  title: string
}

export async function resolveEntitiesForComments(
  pairs: ReadonlyArray<{ type: EntityType; ownerId: bigint }>,
): Promise<Map<string, EntitySlugTitle>> {
  const out = new Map<string, EntitySlugTitle>()
  if (pairs.length === 0) {
    return out
  }
  // Dedupe by `(type, ownerId)` so the IN list stays bounded by the
  // number of distinct entities on the current page, not the number of
  // comments.
  const postIds: bigint[] = []
  const pageIds: bigint[] = []
  const seen = new Set<string>()
  for (const p of pairs) {
    const key = `${p.type}:${p.ownerId}`
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    if (p.type === 'post') {
      postIds.push(p.ownerId)
    } else if (p.type === 'page') {
      pageIds.push(p.ownerId)
    }
  }
  if (postIds.length > 0) {
    const rows = await db
      .select({ id: post.id, slug: post.slug, title: post.title })
      .from(post)
      .where(inArray(post.id, postIds))
    for (const r of rows) {
      out.set(`post:${r.id}`, { type: 'post', slug: r.slug, title: r.title })
    }
  }
  if (pageIds.length > 0) {
    const rows = await db
      .select({ id: page.id, slug: page.slug, title: page.title })
      .from(page)
      .where(inArray(page.id, pageIds))
    for (const r of rows) {
      out.set(`page:${r.id}`, { type: 'page', slug: r.slug, title: r.title })
    }
  }
  return out
}

// Batch helper: returns the parent comment row (joined with its
// author's `user.name`) for every id in `ids`. Used by the `/my/comments`
// loader to surface the「回复 «name»: «excerpt»」block above each reply
// without issuing one round-trip per row.
export interface ParentCommentRow {
  id: bigint
  userId: bigint
  name: string
  content: string
  deletedAt: Date | null
}

export async function findParentCommentsByIds(ids: bigint[]): Promise<Map<string, ParentCommentRow>> {
  const out = new Map<string, ParentCommentRow>()
  if (ids.length === 0) {
    return out
  }
  const rows = await db
    .select({
      id: comment.id,
      userId: comment.userId,
      name: user.name,
      content: comment.content,
      deletedAt: comment.deletedAt,
    })
    .from(comment)
    .innerJoin(user, eq(comment.userId, user.id))
    .where(inArray(comment.id, ids))
  for (const r of rows) {
    out.set(String(r.id), {
      id: r.id,
      userId: r.userId,
      name: r.name,
      content: r.content ?? '',
      deletedAt: r.deletedAt ?? null,
    })
  }
  return out
}

export interface MyCommentEntity {
  type: EntityType
  ownerId: bigint
  slug: string
  title: string
}

// Cap so the Combobox doesn't try to render thousands of options;
// the title-search input below narrows further when the user has
// commented on more than this.
const MY_COMMENT_ENTITY_LIMIT = 20

/**
 * Distinct posts / pages the user has commented on. Backs the
 * "按文章筛选" Combobox on `/admin/me/comments`.
 *
 * Reuses `mineVisibleClause(userId)` as the base predicate so the
 * filter dropdown surfaces the same set of entities the comment list
 * itself can render (i.e. respects the soft-delete grace window).
 *
 * Title matching is performed against the joined `post` / `page` title
 * after resolving the distinct `(type, ownerId)` pairs — the comment
 * row itself doesn't carry the title. Pair volume is bounded by the
 * grace window so the in-TS filter / limit pass is acceptable.
 */
export async function listMyCommentEntities(userId: bigint, options: { q?: string } = {}): Promise<MyCommentEntity[]> {
  const pairs = await db
    .selectDistinct({ type: comment.type, ownerId: comment.ownerId })
    .from(comment)
    .where(mineVisibleClause(userId))
  const resolvable = pairs
    .filter((p): p is { type: EntityType; ownerId: bigint } => p.type !== null && p.ownerId !== null)
    .map((p) => ({ type: p.type, ownerId: p.ownerId }))
  const entityMap = await resolveEntitiesForComments(resolvable)
  const q = options.q?.trim().toLowerCase() ?? ''
  const out: MyCommentEntity[] = []
  for (const p of resolvable) {
    const row = entityMap.get(`${p.type}:${p.ownerId}`)
    if (!row) {
      continue
    }
    if (q !== '' && !row.title.toLowerCase().includes(q)) {
      continue
    }
    out.push({ type: row.type, ownerId: p.ownerId, slug: row.slug, title: row.title })
  }
  out.sort((a, b) => a.title.localeCompare(b.title))
  return out.slice(0, MY_COMMENT_ENTITY_LIMIT)
}

export async function countMyComments(
  userId: bigint,
  filters: MyCommentsFilters = {},
): Promise<{ total: number; pending: number; deleteRequested: number; deleted: number }> {
  const rows = await db
    .select({
      total: count(),
      pending: sql<number>`COUNT(*) FILTER (WHERE ${comment.isPending} = TRUE)`,
      deleteRequested: sql<number>`COUNT(*) FILTER (WHERE ${comment.deleteRequestedAt} IS NOT NULL)`,
      deleted: sql<number>`COUNT(*) FILTER (WHERE ${comment.deletedAt} IS NOT NULL)`,
    })
    .from(comment)
    .where(mineWhere(userId, filters))
  return {
    total: Number(rows[0]?.total ?? 0),
    pending: Number(rows[0]?.pending ?? 0),
    deleteRequested: Number(rows[0]?.deleteRequested ?? 0),
    deleted: Number(rows[0]?.deleted ?? 0),
  }
}
