import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { eq, sql } from 'drizzle-orm'

import { indexPost } from '@/server/domains/posts/services/search-index'
import { comment as commentTable } from '@/server/infra/db/schema/comment'
import { content as contentTable } from '@/server/infra/db/schema/content'
import { post as postMetaTable } from '@/server/infra/db/schema/post'
import { isVitest } from '@/server/infra/env'
import { getLogger } from '@/server/infra/logger'
import { deriveSlug } from '@/server/infra/slug'
import { inklingCommentToMarkdown } from '@/shared/inkling/comment-markdown'
import { collectInklingHeadings } from '@/shared/inkling/headings'
import { collectInklingImageStoragePaths } from '@/shared/inkling/images'
import { commentPortableTextToInklingDocument, portableTextToInklingDocument } from '@/shared/inkling/migrate-pt'
import { validateInklingDocument } from '@/shared/inkling/schema'
import { isRecord } from '@/shared/utils/type-guards'

const log = getLogger('inkling.startup-migration')

/**
 * Batch size for the UPDATE phase. Each batch runs inside a transaction so a
 * failure rolls back only that batch. 50 keeps transactions short enough for
 * long-running locks while amortising the per-row overhead.
 */
const BATCH_SIZE = 50

/**
 * Detect whether a raw JSONB body is already an Inkling document. The
 * canonical shape carries `_type: 'inkling'` at the top level — if that's
 * present and the document parses, the row is already migrated.
 *
 * Returns `'inkling'` if already migrated, `'portable-text'` if it's a
 * legacy PT array, or `'empty'` if the body is null/empty array.
 */
function classifyBody(body: unknown): 'inkling' | 'portable-text' | 'empty' {
  if (body === null || body === undefined) {
    return 'empty'
  }
  if (isRecord(body) && body._type === 'inkling') {
    return 'inkling'
  }
  // Legacy PortableText is a top-level array of blocks. An empty array
  // means no content — treat as empty (no migration needed).
  if (Array.isArray(body)) {
    if (body.length === 0) {
      return 'empty'
    }
    return 'portable-text'
  }
  // Unknown shape — log and treat as empty so we don't crash startup.
  return 'empty'
}

/**
 * Startup migration: convert all legacy PortableText bodies in `content`
 * and `comment` tables to the Inkling document format.
 *
 * This runs once on server startup, in the same block as
 * `migrateSecretsEncryption`. It is **idempotent**: rows already carrying
 * `_type: 'inkling'` are skipped. After the first successful run, every
 * row in the database is Inkling-shaped, so subsequent startups hit the
 * fast path (zero rows to migrate) and the function returns immediately.
 *
 * The migration also regenerates derived data that depends on the body
 * format: `content.headings`, `content.image_sources`, `comment.content`
 * (markdown snapshot), and the `post_search_index` table (plain text +
 * embeddings).
 *
 * In production this is the one-time cutover. In a future release, once
 * all deployments have migrated, this module and the PT→Inkling converter
 * (`shared/inkling/migrate-pt.ts`) can be deleted entirely.
 *
 * @throws if a batch fails to commit — the server will not start with
 *   partially-migrated data. The operator should fix the cause and restart.
 */
export async function migratePortableTextToInkling(db: NodePgDatabase): Promise<void> {
  if (isVitest()) {
    return
  }

  log.info('Checking for legacy PortableText bodies to migrate...')

  const contentResult = await migrateContentBodies(db)
  const commentResult = await migrateCommentBodies(db)

  if (contentResult.migrated > 0 || commentResult.migrated > 0) {
    log.info(
      `Migration complete: ${contentResult.migrated} content revision(s), ` +
        `${commentResult.migrated} comment(s) converted from PortableText to Inkling`,
    )
  } else {
    log.info('No legacy PortableText bodies found — all rows already Inkling or empty')
  }
}

// ─── Content (posts + pages) ───────────────────────────────────────────────

interface MigrationStats {
  migrated: number
  skipped: number
  failed: number
}

async function migrateContentBodies(db: NodePgDatabase): Promise<MigrationStats> {
  // Select all content rows whose body is NOT already Inkling. We check
  // `_type` via JSONB path — if the key doesn't exist or isn't 'inkling',
  // the row needs migration. This is the idempotency gate.
  const rows = await db
    .select({
      id: contentTable.id,
      body: contentTable.body,
    })
    .from(contentTable)
    .where(sql`NOT COALESCE((body->>'_type') = 'inkling', false)`)

  if (rows.length === 0) {
    return { migrated: 0, skipped: 0, failed: 0 }
  }

  log.info(`Found ${rows.length} content revision(s) with legacy bodies — migrating...`)

  let migrated = 0
  let failed = 0

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    try {
      await db.transaction(async (tx) => {
        for (const row of batch) {
          const classification = classifyBody(row.body)
          if (classification === 'inkling' || classification === 'empty') {
            continue
          }

          // Convert PT → Inkling
          const inklingDoc = portableTextToInklingDocument(row.body as never)

          // Regenerate derived data from the new Inkling body
          const headings = collectInklingHeadings(inklingDoc, deriveSlug)
          const imageSources = collectInklingImageStoragePaths(inklingDoc)

          await tx
            .update(contentTable)
            .set({
              body: inklingDoc,
              headings,
              imageSources,
            })
            .where(eq(contentTable.id, row.id))

          migrated += 1
        }
      })
    } catch (error) {
      failed += batch.length
      log.error(`Content batch migration failed (offset ${i}, ${batch.length} rows)`, {
        error: error instanceof Error ? error.name : String(error),
      })
      throw new Error(
        `Content body migration failed at batch offset ${i}. ` +
          'Fix the cause and restart — the server will not start with partially-migrated data.',
      )
    }
  }

  return { migrated, skipped: rows.length - migrated, failed }
}

// ─── Comments ───────────────────────────────────────────────────────────────

async function migrateCommentBodies(db: NodePgDatabase): Promise<MigrationStats> {
  const rows = await db
    .select({
      id: commentTable.id,
      body: commentTable.body,
    })
    .from(commentTable)
    .where(sql`NOT COALESCE((body->>'_type') = 'inkling', false)`)

  if (rows.length === 0) {
    return { migrated: 0, skipped: 0, failed: 0 }
  }

  log.info(`Found ${rows.length} comment(s) with legacy bodies — migrating...`)

  let migrated = 0
  let failed = 0

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    try {
      await db.transaction(async (tx) => {
        for (const row of batch) {
          const classification = classifyBody(row.body)
          if (classification === 'inkling' || classification === 'empty') {
            continue
          }

          // Convert PT → Inkling (comment mode: runs HTML sanitiser, strips
          // article-only blocks, enforces the comment feature set).
          const inklingDoc = commentPortableTextToInklingDocument(row.body as never)

          // Regenerate the markdown snapshot stored in comment.content
          // (used as a rollback / plaintext-extraction fallback).
          const markdownSnapshot = inklingCommentToMarkdown(inklingDoc)

          await tx
            .update(commentTable)
            .set({
              body: inklingDoc,
              content: markdownSnapshot,
            })
            .where(eq(commentTable.id, row.id))

          migrated += 1
        }
      })
    } catch (error) {
      failed += batch.length
      log.error(`Comment batch migration failed (offset ${i}, ${batch.length} rows)`, {
        error: error instanceof Error ? error.name : String(error),
      })
      throw new Error(
        `Comment body migration failed at batch offset ${i}. ` +
          'Fix the cause and restart — the server will not start with partially-migrated data.',
      )
    }
  }

  return { migrated, skipped: rows.length - migrated, failed }
}

// ─── Search index rebuild ───────────────────────────────────────────────────
//
// The search index stores `inklingToPlainText(body)` + an OpenAI embedding.
// After the body migration, any published post whose body changed needs its
// index row updated. We don't need to diff — we just re-index every published
// post that has a search index entry. The `indexPost` function is idempotent
// (upsert via `onConflictDoUpdate`), so re-indexing already-correct rows is
// a no-op.

/**
 * Rebuild the search index for all published posts. Called after the body
 * migration to ensure `post_search_index.plain_text` reflects the Inkling
 * body format.
 *
 * This is the most expensive part of the migration (one OpenAI API call per
 * post). It runs AFTER the body migration succeeds so we never pay the
 * embedding cost for a body that might roll back.
 */
export async function rebuildSearchIndexAfterMigration(db: NodePgDatabase): Promise<void> {
  if (isVitest()) {
    return
  }

  const publishedPosts = await db
    .select({
      id: postMetaTable.id,
      title: postMetaTable.title,
      summary: postMetaTable.summary,
      publishedRevisionId: postMetaTable.publishedRevisionId,
    })
    .from(postMetaTable)
    .where(sql`${postMetaTable.deletedAt} IS NULL AND ${postMetaTable.published} = true`)

  if (publishedPosts.length === 0) {
    return
  }

  log.info(`Rebuilding search index for ${publishedPosts.length} published post(s)...`)

  let indexed = 0
  let failed = 0

  for (const post of publishedPosts) {
    if (post.publishedRevisionId === null) {
      continue
    }
    try {
      // Read the (now-Inkling) body from the content table
      const revision = await db
        .select({ body: contentTable.body })
        .from(contentTable)
        .where(eq(contentTable.id, post.publishedRevisionId))
        .limit(1)

      if (revision.length === 0) {
        continue
      }

      const body = validateInklingDocument(revision[0]!.body)
      await indexPost(db, post.id, post.title, post.summary, body)
      indexed += 1
    } catch (error) {
      failed += 1
      log.warn(`Search index rebuild failed for post ${post.id}`, {
        error: error instanceof Error ? error.name : String(error),
      })
      // Don't throw — a failed embedding is non-fatal. The post will still
      // be searchable by plain text (the `plainText` column is always set);
      // only the vector similarity search degrades.
    }
  }

  if (indexed > 0 || failed > 0) {
    log.info(`Search index rebuild: ${indexed} indexed, ${failed} failed`)
  }
}
