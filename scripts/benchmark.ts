// Engine benchmark: the new embedded stack (SQLite content DB + DuckDB
// analytics sidecar) against the old Postgres stack as the baseline.
//
//   pnpm run bench                       # standard scale, dev-stack PG
//   pnpm run bench -- --scale full       # 20k posts / 100k comments / 1M events
//   pnpm run bench -- --pg postgres://u:p@host:5432/postgres
//   pnpm run bench -- --keep             # keep the PG database + temp files
//
// Method and fairness notes:
//   - Same logical dataset on both stacks (deterministic LCG, seed 42):
//     categories, tags, posts, post_tag links, comments, and access_log
//     events. The PG baseline gets the PRE-MIGRATION schema (hand-written
//     here, mirroring the retired drizzle migrations, indexes included);
//     SQLite runs the repo's real migrations; DuckDB the real DDL.
//   - PG runs in the dev Docker stack over loopback TCP. The network hop
//     is INCLUDED on purpose — removing it is part of what the migration
//     is for. Statements are otherwise equivalent (the old app's ILIKE
//     search is measured as ILIKE on PG, LIKE on SQLite).
//   - Append throughput is measured three ways: PG multi-row INSERT,
//     PG COPY FROM STDIN (the old batcher's actual mechanism), and the
//     DuckDB Appender (the new one).
//   - Read workloads: 2 warmup + 7 measured iterations, MEDIAN reported.
//     Numbers move with machine load — treat <10% deltas as noise.

import { getTableName } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/node-sqlite/migrator'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import pg from 'pg'
import copyFrom from 'pg-copy-streams'

import type { EnrichedAccessEvent } from '@/server/domains/analytics/types'
import type { DatabaseHandle } from '@/server/infra/db/database'

import { ACCESS_LOG_DDL, appendAccessEvent } from '@/server/domains/analytics/services/access-log'
import { closeAnalyticsDatabase, openAnalyticsDatabase } from '@/server/infra/analytics/duckdb'
import { closeDatabase, openDatabase } from '@/server/infra/db/database'
import { comment } from '@/server/infra/db/schema/comment'
import { post } from '@/server/infra/db/schema/post'

// ─── Config ──────────────────────────────────────────────

const SCALES = {
  smoke: { posts: 500, comments: 3_000, events: 10_000, appends: 10_000 },
  standard: { posts: 5_000, comments: 30_000, events: 100_000, appends: 50_000 },
  full: { posts: 20_000, comments: 100_000, events: 1_000_000, appends: 200_000 },
} as const

type ScaleName = keyof typeof SCALES

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag)
  return index === -1 ? undefined : process.argv[index + 1]
}

const scaleArg = argValue('--scale') ?? 'standard'
function isScaleName(value: string): value is ScaleName {
  return value in SCALES
}
const scaleName: ScaleName = isScaleName(scaleArg) ? scaleArg : 'standard'
const SCALE = SCALES[scaleName]
const PG_BASE_URL = argValue('--pg') ?? 'postgres://postgres:postgres@localhost:5433/postgres'
const KEEP = process.argv.includes('--keep')

const CATEGORIES = 50
const TAGS = 200
const USERS = 100
const READ_WARMUP = 2
const READ_RUNS = 7

// ─── Deterministic RNG ───────────────────────────────────

let rngState = 42
/** LCG → [0, 1). Deterministic so both stacks seed identical data. */
function rng(): number {
  rngState = (rngState * 1664525 + 1013904223) % 2 ** 32
  return rngState / 2 ** 32
}
function rngInt(max: number): number {
  return Math.floor(rng() * max)
}
function pick<T>(items: readonly T[]): T {
  return items[rngInt(items.length)]!
}

const WORDS = [
  'sqlite',
  'duckdb',
  'postgres',
  'react',
  'server',
  'blog',
  'post',
  'comment',
  'cache',
  'search',
  'vector',
  'migration',
  'engine',
  'query',
  'index',
]
const COUNTRIES = ['CN', 'US', 'JP', 'DE', 'FR', 'GB', 'KR', 'SG', '', '']
const BROWSERS = ['Chrome', 'Firefox', 'Safari', 'Edge', '']
const OSES = ['macOS', 'Windows', 'Linux', 'iOS', 'Android', '']
const PATHS = Array.from({ length: 200 }, (_, i) => (i % 5 === 0 ? '/' : `/post-${(i % 80) + 1}/`))

function words(count: number): string {
  return Array.from({ length: count }, () => pick(WORDS)).join(' ')
}

// ─── Shared dataset ──────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000
const nowMs = Date.now()

interface PostRow {
  id: number
  slug: string
  title: string
  summary: string
  publishedAt: number
  categoryId: number | null
  authorId: number
}

interface CommentRow {
  postId: number
  userId: number
  content: string
  createdAt: number
  rootId: number | null
}

const posts: PostRow[] = Array.from({ length: SCALE.posts }, (_, i) => ({
  id: i + 1,
  slug: `post-${i + 1}`,
  title: `${words(3)} ${i + 1}`,
  summary: words(12),
  publishedAt: nowMs - rngInt(365) * DAY_MS,
  categoryId: rngInt(10) === 0 ? null : (i % CATEGORIES) + 1,
  authorId: (i % USERS) + 1,
}))

const comments: CommentRow[] = Array.from({ length: SCALE.comments }, (_, i) => {
  const postId = (i % SCALE.posts) + 1
  return {
    postId,
    userId: rngInt(USERS) + 1,
    content: words(8),
    createdAt: nowMs - rngInt(180) * DAY_MS,
    rootId: i % 4 === 0 ? null : i, // some threads, self-consistent enough
  }
})

function makeAccessEvent(): EnrichedAccessEvent {
  const isBot = rng() < 0.1
  return {
    ts: new Date(nowMs - rngInt(30) * DAY_MS - rngInt(DAY_MS)),
    visitorHash: `visitor-${rngInt(500)}`,
    sessionId: rng() < 0.7 ? `session-${rngInt(2_000)}` : null,
    ip: `10.0.${rngInt(256)}.${rngInt(256)}`,
    path: pick(PATHS),
    entityType: rng() < 0.8 ? 'post' : null,
    entityId: rngInt(SCALE.posts) + 1,
    referer: rng() < 0.6 ? 'https://www.google.com/search?q=x' : null,
    refererHost: rng() < 0.6 ? 'www.google.com' : null,
    country: pick(COUNTRIES) || null,
    region: null,
    city: null,
    latitude: null,
    longitude: null,
    timezone: 'Asia/Shanghai',
    language: 'zh-CN',
    ua: 'bench-agent',
    browser: pick(BROWSERS) || null,
    browserVersion: null,
    os: pick(OSES) || null,
    osVersion: null,
    device: null,
    deviceType: rng() < 0.6 ? 'desktop' : 'mobile',
    isBot,
  }
}

// ─── Timing harness ──────────────────────────────────────

interface BenchResult {
  group: string
  workload: string
  baselineMs: number
  newMs: number
  note?: string
}

const results: BenchResult[] = []

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]!
}

function runRead(
  group: string,
  workload: string,
  baseline: () => Promise<void> | void,
  contender: () => Promise<void> | void,
  note?: string,
): Promise<void> {
  return (async () => {
    for (let i = 0; i < READ_WARMUP; i++) {
      await baseline()
      await contender()
    }
    const baseTimes: number[] = []
    const newTimes: number[] = []
    for (let i = 0; i < READ_RUNS; i++) {
      let t0 = performance.now()
      await baseline()
      baseTimes.push(performance.now() - t0)
      t0 = performance.now()
      await contender()
      newTimes.push(performance.now() - t0)
    }
    results.push({ group, workload, baselineMs: median(baseTimes), newMs: median(newTimes), note })
  })()
}

async function runThroughput(
  group: string,
  workload: string,
  variants: [string, () => Promise<void> | void][],
): Promise<void> {
  for (const [label, fn] of variants) {
    const t0 = performance.now()
    await fn()
    const elapsed = performance.now() - t0
    // Throughput rows carry ONE time (the label names the engine) — newMs
    // stays 0 and renders as '—'.
    results.push({ group, workload: `${workload} — ${label}`, baselineMs: elapsed, newMs: 0 })
  }
}

// ─── Postgres baseline ───────────────────────────────────

pg.types.setTypeParser(20, (value: string | null) => (value === null ? null : Number(value)))

const PG_DDL = `
CREATE TABLE "user" (
  id bigserial PRIMARY KEY, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
  name text NOT NULL, email text NOT NULL UNIQUE, password text NOT NULL, role text
);
CREATE TABLE category (
  id bigserial PRIMARY KEY, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
  name varchar(20) NOT NULL UNIQUE, slug varchar(80) NOT NULL UNIQUE, cover text NOT NULL DEFAULT '', description text NOT NULL DEFAULT ''
);
CREATE TABLE tag (
  id bigserial PRIMARY KEY, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
  name varchar(50) NOT NULL UNIQUE, slug varchar(80) NOT NULL UNIQUE
);
CREATE TABLE post (
  id bigserial PRIMARY KEY, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
  deleted_at timestamptz, slug varchar(80) NOT NULL UNIQUE, title varchar(200) NOT NULL,
  summary text NOT NULL DEFAULT '', cover text NOT NULL DEFAULT '', published boolean NOT NULL DEFAULT true,
  published_at timestamptz NOT NULL, author_id bigint, category_id bigint, alias jsonb NOT NULL DEFAULT '[]'
);
CREATE INDEX idx_post_catalog ON post (deleted_at, published, published_at);
CREATE INDEX idx_post_category_id ON post (category_id);
CREATE TABLE post_tag (post_id bigint NOT NULL, tag_id bigint NOT NULL, PRIMARY KEY (post_id, tag_id));
CREATE INDEX idx_post_tag_tag_id ON post_tag (tag_id);
CREATE TABLE comment (
  id bigserial PRIMARY KEY, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
  deleted_at timestamptz, content text DEFAULT '', body jsonb NOT NULL DEFAULT '[]',
  type varchar(16) NOT NULL, owner_id bigint NOT NULL, user_id bigint NOT NULL,
  rid bigint NOT NULL DEFAULT 0, root_id bigint
);
CREATE INDEX idx_comment_owner ON comment (type, owner_id);
CREATE INDEX idx_comment_root_id ON comment (root_id);
CREATE TABLE access_log (
  ts timestamptz NOT NULL, visitor_hash text NOT NULL, session_id text, ip inet, path text NOT NULL,
  entity_type varchar(16), entity_id bigint, referer text, referer_host text, country text, region text,
  city text, latitude double precision, longitude double precision, timezone text, language text,
  ua text, browser text, browser_version text, os text, os_version text, device text, device_type text,
  is_bot boolean DEFAULT false NOT NULL
);
CREATE INDEX idx_access_log_entity_ts ON access_log (entity_type, entity_id, ts);
CREATE INDEX idx_access_log_path_ts ON access_log (path, ts);
CREATE INDEX idx_access_log_country_ts ON access_log (country, ts);
CREATE INDEX idx_access_log_visitor_ts ON access_log (visitor_hash, ts);
CREATE INDEX idx_access_log_referer_host_ts ON access_log (referer_host, ts);
CREATE INDEX idx_access_log_is_bot_ts ON access_log (is_bot, ts);
`

async function pgInsertChunks(
  client: pg.Client,
  build: (from: number, to: number) => [string, unknown[]],
  total: number,
  chunk = 500,
): Promise<void> {
  for (let from = 0; from < total; from += chunk) {
    const to = Math.min(from + chunk, total)
    const [sql, params] = build(from, to)
    await client.query(sql, params)
  }
}

async function seedPostgres(client: pg.Client): Promise<void> {
  console.log('    seeding postgres baseline…')
  await pgInsertChunks(
    client,
    (from, to) => {
      const values: string[] = []
      const params: unknown[] = []
      for (let i = from; i < to; i++) {
        values.push(
          `($${params.length + 1}, $${params.length + 2}, $${params.length + 3}, $${params.length + 4}, $${params.length + 5}, $${params.length + 6})`,
        )
        params.push(new Date(nowMs), new Date(nowMs), `User ${i + 1}`, `user-${i + 1}@bench.local`, 'x', 'author')
      }
      return [
        `INSERT INTO "user" (created_at, updated_at, name, email, password, role) VALUES ${values.join(',')}`,
        params,
      ]
    },
    USERS,
  )
  await pgInsertChunks(
    client,
    (from, to) => {
      const values: string[] = []
      const params: unknown[] = []
      for (let i = from; i < to; i++) {
        values.push(`($${params.length + 1}, $${params.length + 2}, $${params.length + 3}, $${params.length + 4})`)
        params.push(new Date(nowMs), new Date(nowMs), `Category ${i + 1}`, `category-${i + 1}`)
      }
      return [`INSERT INTO category (created_at, updated_at, name, slug) VALUES ${values.join(',')}`, params]
    },
    CATEGORIES,
  )
  await pgInsertChunks(
    client,
    (from, to) => {
      const values: string[] = []
      const params: unknown[] = []
      for (let i = from; i < to; i++) {
        values.push(`($${params.length + 1}, $${params.length + 2}, $${params.length + 3}, $${params.length + 4})`)
        params.push(new Date(nowMs), new Date(nowMs), `Tag ${i + 1}`, `tag-${i + 1}`)
      }
      return [`INSERT INTO tag (created_at, updated_at, name, slug) VALUES ${values.join(',')}`, params]
    },
    TAGS,
  )
  await pgInsertChunks(
    client,
    (from, to) => {
      const values: string[] = []
      const params: unknown[] = []
      for (const p of posts.slice(from, to)) {
        values.push(
          `($${params.length + 1}, $${params.length + 2}, $${params.length + 3}, $${params.length + 4}, $${params.length + 5}, $${params.length + 6}, $${params.length + 7}, $${params.length + 8})`,
        )
        params.push(
          new Date(nowMs),
          new Date(nowMs),
          p.slug,
          p.title,
          p.summary,
          new Date(p.publishedAt),
          p.authorId,
          p.categoryId,
        )
      }
      return [
        `INSERT INTO post (created_at, updated_at, slug, title, summary, published_at, author_id, category_id) VALUES ${values.join(',')}`,
        params,
      ]
    },
    posts.length,
  )
  await pgInsertChunks(
    client,
    (from, to) => {
      const values: string[] = []
      const params: unknown[] = []
      for (let i = from; i < to; i++) {
        values.push(`($${params.length + 1}, $${params.length + 2})`)
        params.push(posts[i]!.id, (i % TAGS) + 1)
      }
      return [`INSERT INTO post_tag (post_id, tag_id) VALUES ${values.join(',')} ON CONFLICT DO NOTHING`, params]
    },
    posts.length,
  )
  await pgInsertChunks(
    client,
    (from, to) => {
      const values: string[] = []
      const params: unknown[] = []
      for (const c of comments.slice(from, to)) {
        values.push(
          `($${params.length + 1}, $${params.length + 2}, $${params.length + 3}, $${params.length + 4}, $${params.length + 5}, $${params.length + 6}, $${params.length + 7})`,
        )
        params.push(new Date(c.createdAt), new Date(c.createdAt), c.content, 'post', c.postId, c.userId, c.rootId)
      }
      return [
        `INSERT INTO comment (created_at, updated_at, content, type, owner_id, user_id, root_id) VALUES ${values.join(',')}`,
        params,
      ]
    },
    comments.length,
  )
  await pgInsertChunks(
    client,
    (from, to) => {
      const values: string[] = []
      const params: unknown[] = []
      for (let i = from; i < to; i++) {
        const e = makeAccessEvent()
        values.push(
          `($${params.length + 1}, $${params.length + 2}, $${params.length + 3}, $${params.length + 4}, $${params.length + 5}, $${params.length + 6}, $${params.length + 7}, $${params.length + 8}, $${params.length + 9}, $${params.length + 10}, $${params.length + 11}, $${params.length + 12}, $${params.length + 13})`,
        )
        params.push(
          e.ts,
          e.visitorHash,
          e.sessionId,
          e.ip,
          e.path,
          e.entityType,
          e.entityId,
          e.refererHost,
          e.country,
          e.timezone,
          e.browser,
          e.os,
          e.isBot,
        )
      }
      return [
        `INSERT INTO access_log (ts, visitor_hash, session_id, ip, path, entity_type, entity_id, referer_host, country, timezone, browser, os, is_bot) VALUES ${values.join(',')}`,
        params,
      ]
    },
    SCALE.events,
  )
  await client.query('ANALYZE')
}

// ─── SQLite seed ─────────────────────────────────────────

function seedSqlite(handle: DatabaseHandle): void {
  console.log('    seeding sqlite…')
  const c = handle.client
  const postTable = getTableName(post)
  const commentTable = getTableName(comment)
  c.exec('PRAGMA foreign_keys = OFF')
  c.exec('BEGIN')
  try {
    const insertUser = c.prepare(
      'INSERT INTO "user" (created_at, updated_at, name, email, password, role) VALUES (?, ?, ?, ?, ?, ?)',
    )
    for (let i = 0; i < USERS; i++) {
      insertUser.run(nowMs, nowMs, `User ${i + 1}`, `user-${i + 1}@bench.local`, 'x', 'author')
    }
    const insertCategory = c.prepare(
      'INSERT INTO category (created_at, updated_at, name, slug, cover) VALUES (?, ?, ?, ?, ?)',
    )
    for (let i = 0; i < CATEGORIES; i++) {
      insertCategory.run(nowMs, nowMs, `Category ${i + 1}`, `category-${i + 1}`, '')
    }
    const insertTag = c.prepare('INSERT INTO tag (created_at, updated_at, name, slug) VALUES (?, ?, ?, ?)')
    for (let i = 0; i < TAGS; i++) {
      insertTag.run(nowMs, nowMs, `Tag ${i + 1}`, `tag-${i + 1}`)
    }
    const insertPost = c.prepare(
      `INSERT INTO ${postTable} (created_at, updated_at, slug, title, summary, published_at, author_id, category_id, alias)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    for (const p of posts) {
      insertPost.run(nowMs, nowMs, p.slug, p.title, p.summary, p.publishedAt, p.authorId, p.categoryId, '[]')
    }
    const insertPostTag = c.prepare('INSERT OR IGNORE INTO post_tag (post_id, tag_id) VALUES (?, ?)')
    for (let i = 0; i < posts.length; i++) {
      insertPostTag.run(posts[i]!.id, (i % TAGS) + 1)
    }
    const insertComment = c.prepare(
      `INSERT INTO ${commentTable} (created_at, updated_at, content, body, type, owner_id, user_id, root_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    for (const cm of comments) {
      insertComment.run(cm.createdAt, cm.createdAt, cm.content, '[]', 'post', cm.postId, cm.userId, cm.rootId)
    }
    c.exec('COMMIT')
  } catch (error) {
    c.exec('ROLLBACK')
    throw error
  }
  c.exec('PRAGMA foreign_keys = ON')
  c.exec('ANALYZE')
}

// ─── Main ────────────────────────────────────────────────

async function main() {
  console.log(
    `==> engine benchmark (scale: ${scaleName} — ${SCALE.posts} posts, ${SCALE.comments} comments, ${SCALE.events} events)`,
  )

  // Fresh PG database.
  const dbName = `kobato_bench_${Math.random().toString(16).slice(2, 10)}`
  const admin = new pg.Client({ connectionString: PG_BASE_URL })
  await admin.connect()
  await admin.query(`DROP DATABASE IF EXISTS "${dbName}"`)
  await admin.query(`CREATE DATABASE "${dbName}"`)
  const url = new URL(PG_BASE_URL)
  url.pathname = `/${dbName}`
  const client = new pg.Client({ connectionString: url.toString() })
  await client.connect()
  await client.query(PG_DDL)
  await seedPostgres(client)

  // Fresh SQLite + DuckDB.
  const dir = mkdtempSync(join(tmpdir(), 'kobato-bench-'))
  const handle = openDatabase(join(dir, 'kobato.db'))
  migrate(handle.db, { migrationsFolder: './drizzle', migrationsTable: '__drizzle_migrations' })
  seedSqlite(handle)
  const analytics = await openAnalyticsDatabase(join(dir, 'analytics.duckdb'), ACCESS_LOG_DDL)
  console.log('    seeding duckdb…')
  {
    const appender = await analytics.writer.createAppender('access_log')
    for (let i = 0; i < SCALE.events; i++) {
      appendAccessEvent(appender, makeAccessEvent())
      appender.endRow()
      if ((i + 1) % 2048 === 0) {
        appender.flushSync()
      }
    }
    appender.closeSync()
  }

  const sqlite = handle.client
  const duck = analytics.reader
  const windowStart = nowMs - 30 * DAY_MS

  // ── Content reads: PG vs SQLite ──

  await runRead(
    'content',
    'point read post by slug',
    async () => {
      await client.query('SELECT * FROM post WHERE slug = $1', [pick(posts).slug])
    },
    () => {
      sqlite.prepare('SELECT * FROM post WHERE slug = ?').get(pick(posts).slug)
    },
  )

  await runRead(
    'content',
    'catalog page (latest 20 published)',
    async () => {
      await client.query(
        'SELECT id, slug, title, published_at FROM post WHERE published AND deleted_at IS NULL ORDER BY published_at DESC LIMIT 20',
      )
    },
    () => {
      sqlite
        .prepare(
          'SELECT id, slug, title, published_at FROM post WHERE published AND deleted_at IS NULL ORDER BY published_at DESC LIMIT 20',
        )
        .all()
    },
  )

  await runRead(
    'content',
    'post comments (latest 50)',
    async () => {
      await client.query(
        "SELECT id, content, created_at, user_id, root_id FROM comment WHERE type = 'post' AND owner_id = $1 ORDER BY created_at DESC LIMIT 50",
        [pick(posts).id],
      )
    },
    () => {
      sqlite
        .prepare(
          "SELECT id, content, created_at, user_id, root_id FROM comment WHERE type = 'post' AND owner_id = ? ORDER BY created_at DESC LIMIT 50",
        )
        .all(pick(posts).id)
    },
  )

  await runRead(
    'content',
    'text search (ILIKE vs LIKE)',
    async () => {
      await client.query(
        "SELECT id FROM post WHERE published AND deleted_at IS NULL AND (title ILIKE '%sqlite%' OR summary ILIKE '%sqlite%') LIMIT 20",
      )
    },
    () => {
      sqlite
        .prepare(
          "SELECT id FROM post WHERE published AND deleted_at IS NULL AND (title LIKE '%sqlite%' OR summary LIKE '%sqlite%') LIMIT 20",
        )
        .all()
    },
    'old app used ILIKE; new app uses LIKE',
  )

  await runRead(
    'content',
    'tag page (join post_tag)',
    async () => {
      await client.query(
        `SELECT p.id, p.slug, p.title FROM post p JOIN post_tag pt ON pt.post_id = p.id
         WHERE pt.tag_id = $1 AND p.published AND p.deleted_at IS NULL ORDER BY p.published_at DESC LIMIT 20`,
        [rngInt(TAGS) + 1],
      )
    },
    () => {
      sqlite
        .prepare(
          `SELECT p.id, p.slug, p.title FROM post p JOIN post_tag pt ON pt.post_id = p.id
           WHERE pt.tag_id = ? AND p.published AND p.deleted_at IS NULL ORDER BY p.published_at DESC LIMIT 20`,
        )
        .all(rngInt(TAGS) + 1)
    },
  )

  // ── Content writes ──

  await runThroughput('content', 'single-row comment insert ×500', [
    [
      'postgres (autocommit)',
      async () => {
        for (let i = 0; i < 500; i++) {
          const cm = comments[i]!
          await client.query(
            "INSERT INTO comment (created_at, updated_at, content, type, owner_id, user_id) VALUES ($1, $2, $3, 'post', $4, $5)",
            [new Date(cm.createdAt), new Date(cm.createdAt), cm.content, cm.postId, cm.userId],
          )
        }
      },
    ],
    [
      'sqlite (autocommit)',
      () => {
        const insert = sqlite.prepare(
          "INSERT INTO comment (created_at, updated_at, content, body, type, owner_id, user_id) VALUES (?, ?, ?, '[]', 'post', ?, ?)",
        )
        for (let i = 0; i < 500; i++) {
          const cm = comments[i]!
          insert.run(cm.createdAt, cm.createdAt, cm.content, cm.postId, cm.userId)
        }
      },
    ],
  ])

  await runThroughput('content', 'batch insert 10k comments (200/txn)', [
    [
      'postgres (multi-row VALUES)',
      async () => {
        await pgInsertChunks(
          client,
          (from, to) => {
            const values: string[] = []
            const params: unknown[] = []
            for (let i = from; i < to; i++) {
              const cm = comments[i % comments.length]!
              values.push(
                `($${params.length + 1}, $${params.length + 2}, $${params.length + 3}, $${params.length + 4}, $${params.length + 5}, $${params.length + 6})`,
              )
              params.push(new Date(cm.createdAt), new Date(cm.createdAt), cm.content, 'post', cm.postId, cm.userId)
            }
            return [
              `INSERT INTO comment (created_at, updated_at, content, type, owner_id, user_id) VALUES ${values.join(',')}`,
              params,
            ]
          },
          10_000,
          200,
        )
      },
    ],
    [
      'sqlite (multi-row VALUES)',
      () => {
        for (let from = 0; from < 10_000; from += 200) {
          const rows: string[] = []
          const params: (string | number)[] = []
          for (let i = from; i < Math.min(from + 200, 10_000); i++) {
            const cm = comments[i % comments.length]!
            rows.push('(?, ?, ?, ?, ?, ?, ?)')
            params.push(cm.createdAt, cm.createdAt, cm.content, '[]', 'post', cm.postId, cm.userId)
          }
          sqlite.exec('BEGIN')
          sqlite
            .prepare(
              `INSERT INTO comment (created_at, updated_at, content, body, type, owner_id, user_id) VALUES ${rows.join(',')}`,
            )
            .run(...params)
          sqlite.exec('COMMIT')
        }
      },
    ],
  ])

  // ── Analytics appends ──

  await runThroughput('analytics', `append ${SCALE.appends} events`, [
    [
      'postgres (multi-row VALUES)',
      async () => {
        await pgInsertChunks(
          client,
          (from, to) => {
            const values: string[] = []
            const params: unknown[] = []
            for (let i = from; i < to; i++) {
              const e = makeAccessEvent()
              values.push(
                `($${params.length + 1}, $${params.length + 2}, $${params.length + 3}, $${params.length + 4}, $${params.length + 5}, $${params.length + 6}, $${params.length + 7}, $${params.length + 8})`,
              )
              params.push(e.ts, e.visitorHash, e.path, e.entityType, e.entityId, e.country, e.browser, e.isBot)
            }
            return [
              `INSERT INTO access_log (ts, visitor_hash, path, entity_type, entity_id, country, browser, is_bot) VALUES ${values.join(',')}`,
              params,
            ]
          },
          SCALE.appends,
          500,
        )
      },
    ],
    [
      'postgres (COPY FROM STDIN — the old batcher)',
      async () => {
        const escape = (v: string | null): string =>
          v === null ? '\\N' : v.replace(/\\/g, '\\\\').replace(/\t/g, '\\t').replace(/\n/g, '\\n')
        const lines: string[] = []
        for (let i = 0; i < SCALE.appends; i++) {
          const e = makeAccessEvent()
          lines.push(
            [
              e.ts.toISOString(),
              escape(e.visitorHash),
              escape(e.sessionId),
              escape(e.ip),
              escape(e.path),
              escape(e.entityType),
              e.entityId === null ? '\\N' : String(e.entityId),
              escape(e.referer),
              escape(e.refererHost),
              escape(e.country),
              escape(e.region),
              escape(e.city),
              e.latitude === null ? '\\N' : String(e.latitude),
              e.longitude === null ? '\\N' : String(e.longitude),
              escape(e.timezone),
              escape(e.language),
              escape(e.ua),
              escape(e.browser),
              escape(e.browserVersion),
              escape(e.os),
              escape(e.osVersion),
              escape(e.device),
              escape(e.deviceType),
              e.isBot ? 't' : 'f',
            ].join('\t'),
          )
        }
        const stream = client.query(
          copyFrom.from(
            `COPY access_log (ts, visitor_hash, session_id, ip, path, entity_type, entity_id, referer, referer_host, country, region, city, latitude, longitude, timezone, language, ua, browser, browser_version, os, os_version, device, device_type, is_bot) FROM STDIN`,
          ),
        )
        await new Promise<void>((resolvePromise, rejectPromise) => {
          stream.on('error', rejectPromise)
          stream.on('finish', resolvePromise)
          stream.write(lines.join('\n') + '\n')
          stream.end()
        })
      },
    ],
    [
      'duckdb (Appender — the new batcher)',
      async () => {
        const appender = await analytics.writer.createAppender('access_log')
        for (let i = 0; i < SCALE.appends; i++) {
          appendAccessEvent(appender, makeAccessEvent())
          appender.endRow()
          if ((i + 1) % 2048 === 0) {
            appender.flushSync()
          }
        }
        appender.closeSync()
      },
    ],
  ])

  // ── Analytics reads: PG (btree indexes) vs DuckDB (zone maps) ──

  await runRead(
    'analytics',
    'counters (visits/visitors/referers, 30d)',
    async () => {
      await client.query(
        `SELECT COUNT(*) AS visits, COUNT(DISTINCT visitor_hash) AS visitors,
                COUNT(DISTINCT referer_host) FILTER (WHERE referer_host IS NOT NULL AND referer_host <> '') AS referers
         FROM access_log WHERE is_bot = false AND ts >= $1 AND ts < $2`,
        [new Date(windowStart), new Date(nowMs)],
      )
    },
    async () => {
      await duck.runAndReadAll(
        `SELECT COUNT(*) AS visits, COUNT(DISTINCT visitor_hash) AS visitors,
                COUNT(DISTINCT referer_host) FILTER (WHERE referer_host IS NOT NULL AND referer_host <> '') AS referers
         FROM access_log WHERE is_bot = FALSE AND ts >= epoch_ms(?::BIGINT) AND ts < epoch_ms(?::BIGINT)`,
        [BigInt(windowStart), BigInt(nowMs)],
      )
    },
  )

  await runRead(
    'analytics',
    'views buckets (30 × 1-day)',
    async () => {
      await client.query(
        `SELECT date_trunc('day', ts) AS bucket, COUNT(*), COUNT(DISTINCT visitor_hash)
         FROM access_log WHERE is_bot = false AND ts >= $1 AND ts < $2 GROUP BY 1 ORDER BY 1`,
        [new Date(windowStart), new Date(nowMs)],
      )
    },
    async () => {
      await duck.runAndReadAll(
        `SELECT time_bucket(INTERVAL '1 day', ts) AS bucket, COUNT(*), COUNT(DISTINCT visitor_hash)
         FROM access_log WHERE is_bot = FALSE AND ts >= epoch_ms(?::BIGINT) AND ts < epoch_ms(?::BIGINT) GROUP BY 1 ORDER BY 1`,
        [BigInt(windowStart), BigInt(nowMs)],
      )
    },
  )

  await runRead(
    'analytics',
    'metric group-by (top 20 countries)',
    async () => {
      await client.query(
        `SELECT COALESCE(NULLIF(country, ''), '(unknown)') AS name, COUNT(*), COUNT(DISTINCT visitor_hash)
         FROM access_log WHERE is_bot = false AND ts >= $1 AND ts < $2 GROUP BY 1 ORDER BY 2 DESC LIMIT 20`,
        [new Date(windowStart), new Date(nowMs)],
      )
    },
    async () => {
      await duck.runAndReadAll(
        `SELECT COALESCE(NULLIF(country, ''), '(unknown)') AS name, COUNT(*), COUNT(DISTINCT visitor_hash)
         FROM access_log WHERE is_bot = FALSE AND ts >= epoch_ms(?::BIGINT) AND ts < epoch_ms(?::BIGINT) GROUP BY 1 ORDER BY 2 DESC LIMIT 20`,
        [BigInt(windowStart), BigInt(nowMs)],
      )
    },
  )

  await runRead(
    'analytics',
    'heatmap (7 × 24 cells)',
    async () => {
      await client.query(
        `SELECT EXTRACT(dow FROM ts) AS weekday, EXTRACT(hour FROM ts) AS hour, COUNT(*), COUNT(DISTINCT visitor_hash)
         FROM access_log WHERE is_bot = false AND ts >= $1 AND ts < $2 GROUP BY 1, 2`,
        [new Date(windowStart), new Date(nowMs)],
      )
    },
    async () => {
      await duck.runAndReadAll(
        `SELECT EXTRACT(dow FROM ts) AS weekday, EXTRACT(hour FROM ts) AS hour, COUNT(*), COUNT(DISTINCT visitor_hash)
         FROM access_log WHERE is_bot = FALSE AND ts >= epoch_ms(?::BIGINT) AND ts < epoch_ms(?::BIGINT) GROUP BY 1, 2`,
        [BigInt(windowStart), BigInt(nowMs)],
      )
    },
  )

  await runRead(
    'analytics',
    'realtime tail (latest 50)',
    async () => {
      await client.query(
        'SELECT ts, path, country, city, browser, os, device_type, is_bot FROM access_log WHERE ts > $1 ORDER BY ts DESC LIMIT 50',
        [new Date(nowMs - 60_000)],
      )
    },
    async () => {
      await duck.runAndReadAll(
        'SELECT ts, path, country, city, browser, os, device_type, is_bot FROM access_log WHERE ts > epoch_ms(?::BIGINT) ORDER BY ts DESC LIMIT 50',
        [BigInt(nowMs - 60_000)],
      )
    },
  )

  // ── Report ──

  console.log('\n| group | workload | postgres | new engine | speedup |')
  console.log('| --- | --- | ---: | ---: | ---: |')
  const fmt = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${ms.toFixed(1)} ms`)
  for (const r of results) {
    const speedup = r.baselineMs > 0 && r.newMs > 0 ? `${(r.baselineMs / r.newMs).toFixed(2)}×` : '—'
    console.log(
      `| ${r.group} | ${r.workload} | ${fmt(r.baselineMs)} | ${r.newMs > 0 ? fmt(r.newMs) : '—'} | ${speedup} |`,
    )
  }
  console.log(
    '\nNotes: PG ran in the dev Docker stack over loopback TCP (the hop is included on purpose).\n' +
      'Reads: median of 7 measured iterations after 2 warmups. Appends: single shot.\n' +
      `Dataset: ${SCALE.posts} posts, ${SCALE.comments} comments, ${SCALE.events} access_log events (seed 42).`,
  )

  // ── Cleanup ──
  await client.end()
  closeDatabase(handle)
  await closeAnalyticsDatabase(analytics)
  if (KEEP) {
    console.log(`\nkept: PG database "${dbName}", temp dir ${dir}`)
  } else {
    await admin.query(`DROP DATABASE IF EXISTS "${dbName}"`)
    rmSync(dir, { recursive: true, force: true })
  }
  await admin.end()
}

await main()
