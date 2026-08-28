import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Database } from '@/server/infra/db/database'
import type { BlogSettingsBundle } from '@/shared/config/types'

import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { makeMemoryBackend } from '#/_helpers/memory-storage'
import { flipBrandingDrivers } from '@/server/domains/assets/services/storage'
import { backfillStorageAssetUrls } from '@/server/domains/content/services/asset-url-backfill'
import { invalidateImageEnhanceCacheFor } from '@/server/domains/images/services/cache'
import { updateBlogSettingsSection } from '@/server/domains/settings/services/core'
import { setting } from '@/server/infra/db/schema/config'
import { content as contentTable } from '@/server/infra/db/schema/content'
import { image } from '@/server/infra/db/schema/media'
import { post as postTable } from '@/server/infra/db/schema/post'
import { storageMigration } from '@/server/infra/db/schema/storage-migration'
import { DomainError } from '@/server/infra/http/errors'
import { DEFAULT_PRIVATE_CACHE_CONTROL, DEFAULT_PUBLIC_CACHE_CONTROL } from '@/server/infra/storage/key-policy'
import { __resetStorageBackendsForTests, __setStorageBackendForTests } from '@/server/infra/storage/registry'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'

// `validateS3Config` (settings lock guard) loads the SDK lazily — mock it so
// probe outcomes are deterministic without network access.
const s3Probe = vi.hoisted(() => ({ send: vi.fn<(...args: unknown[]) => Promise<unknown>>() }))
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class {
    send = s3Probe.send
    destroy(): void {}
    middlewareStack = { addRelativeTo(): void {} }
  },
  HeadBucketCommand: class {
    constructor(public input: unknown) {}
  },
  ListObjectsV2Command: class {
    constructor(public input: unknown) {}
  },
}))

// The registry seam must point at memory backends BEFORE the migration module
// resolves backends — set the seam first, then import the module under test.
const localMem = makeMemoryBackend({ driver: 'local' })
const s3Mem = makeMemoryBackend()
const targetMem = makeMemoryBackend()
__setStorageBackendForTests('local', localMem.backend)
__setStorageBackendForTests('s3', s3Mem.backend)

const {
  __awaitStorageMigrationForTests,
  __resetS3MigrationForTests,
  __setS3MigrationSourceFactoryForTests,
  __setS3MigrationTargetFactoryForTests,
  cancelStorageMigration,
  getStorageMigrationStatus,
  isStorageMigrationActive,
  resumeStorageMigration,
  startStorageMigration,
  wireS3Migration,
} = await import('@/server/domains/storage/s3-migration')

const db = getTestDb()

const TARGET_CONFIG = {
  enabled: true,
  endpoint: 'https://s3-new.example.com',
  region: 'auto',
  bucket: 'kobato-new',
  accessKeyId: 'AKIA-NEW',
  secretAccessKey: 'secret-new',
  forcePathStyle: false,
  urlTemplate: '',
}

type AssetsSection = NonNullable<BlogSettingsBundle['assets']>

function bundleWithStorage(storage: Partial<AssetsSection['storage']>): BlogSettingsBundle {
  const assets = TEST_BLOG_SETTINGS_BUNDLE.assets!
  return {
    ...TEST_BLOG_SETTINGS_BUNDLE,
    assets: {
      ...assets,
      storage: { ...assets.storage, ...storage },
    },
  }
}

/**
 * Same collaborators the composition root wires in db-lifecycle — the run
 * needs them from the switch phase onward (`requireHooks()`). Tests override
 * `postSwitchBackfill` to exercise failure handling.
 */
function wireTestHooks(postSwitchBackfill: (hookDb: Database) => Promise<unknown> = backfillStorageAssetUrls): void {
  wireS3Migration({
    persistFlippedStorage: async (hookDb, storage) => {
      const current = getBlogSettingsBundleSync()?.assets
      if (current === undefined || current === null) {
        throw new Error('assets settings bundle missing in test wiring')
      }
      await updateBlogSettingsSection(
        hookDb,
        'assets',
        { asset: current.asset, upload: current.upload, storage },
        null,
        { allowStorageConfigOverride: true },
      )
    },
    flipBrandingDrivers,
    invalidateImageMeta: async (hookDb, storagePaths) => {
      for (const storagePath of storagePaths) {
        await invalidateImageEnhanceCacheFor(hookDb, storagePath)
      }
    },
    postSwitchBackfill: async (hookDb) => postSwitchBackfill(hookDb),
  })
}

beforeEach(async () => {
  __setStorageBackendForTests('local', localMem.backend)
  __setStorageBackendForTests('s3', s3Mem.backend)
  __setS3MigrationTargetFactoryForTests(() => targetMem.backend)
  // The migration binds its S3 SOURCE to the pre-flip config snapshot — the
  // registry's static `s3` seam no longer covers it.
  __setS3MigrationSourceFactoryForTests(() => s3Mem.backend)
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
  s3Probe.send.mockReset()
  s3Probe.send.mockResolvedValue({})
  await clearAllTables(db)
  wireTestHooks()
})

afterEach(async () => {
  await __awaitStorageMigrationForTests()
  __resetS3MigrationForTests()
  __resetStorageBackendsForTests()
  localMem.reset()
  s3Mem.reset()
  targetMem.reset()
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
})

function seedObject(target: { store: Map<string, { body: Buffer; contentType: string }> }, key: string): void {
  target.store.set(key, { body: Buffer.from(`body-${key}`), contentType: 'application/octet-stream' })
}

/**
 * Hydration only yields a bundle when BOTH the general and assets rows exist
 * — seed them (from the bundle the snapshot carries) before any test that
 * asserts on the post-switch refreshed snapshot.
 */
async function seedSettingsRows(bundle: BlogSettingsBundle): Promise<void> {
  await db.insert(setting).values({ scope: 'blog.general', data: bundle.siteIdentity })
  await db.insert(setting).values({ scope: 'blog.assets', data: bundle.assets })
}

async function seedImageRow(storagePath: string, storageDriver: 's3' | 'local') {
  await db.insert(image).values({
    storagePath,
    storageDriver,
    mimeType: 'image/jpeg',
    width: 640,
    height: 480,
    byteSize: 4096,
  })
}

async function readDriver(storagePath: string): Promise<string> {
  const rows = await db.select().from(image).where(eq(image.storagePath, storagePath))
  return rows[0]!.storageDriver
}

describe('storage/s3-migration — local-to-s3', () => {
  it('copies every local object, flips driver columns and enables the S3 config', async () => {
    const bundle = bundleWithStorage({ enabled: false })
    setBlogSettingsBundleForTests(bundle)
    await seedSettingsRows(bundle)
    seedObject(localMem, 'images/a.jpg')
    seedObject(localMem, 'backup/backup-1.db')
    await seedImageRow('images/a.jpg', 'local')

    const started = await startStorageMigration(db, { target: 's3', config: TARGET_CONFIG })
    expect(started.phase).toBe('copying')
    expect(started.direction).toBe('local-to-s3')

    await __awaitStorageMigrationForTests()

    const status = await getStorageMigrationStatus(db)
    expect(status.phase).toBe('completed')
    expect(status.copiedObjects).toBe(2)
    expect(targetMem.store.has('images/a.jpg')).toBe(true)
    expect(targetMem.store.has('backup/backup-1.db')).toBe(true)
    expect(await readDriver('images/a.jpg')).toBe('s3')

    const storage = getBlogSettingsBundleSync()!.assets!.storage
    expect(storage.enabled).toBe(true)
    expect(storage.bucket).toBe('kobato-new')
  })

  it('records a matching consistency verification on completion', async () => {
    const bundle = bundleWithStorage({ enabled: false })
    setBlogSettingsBundleForTests(bundle)
    await seedSettingsRows(bundle)
    seedObject(localMem, 'images/a.jpg')
    seedObject(localMem, 'images/b.jpg')

    await startStorageMigration(db, { target: 's3', config: TARGET_CONFIG })
    await __awaitStorageMigrationForTests()

    const status = await getStorageMigrationStatus(db)
    expect(status.phase).toBe('completed')
    expect(status.verification).toMatchObject({
      sourceCount: 2,
      targetCount: 2,
      sourceBytes: 'body-images/a.jpg'.length + 'body-images/b.jpg'.length,
      targetBytes: 'body-images/a.jpg'.length + 'body-images/b.jpg'.length,
      matches: true,
    })
    expect(typeof status.verification?.checkedAt).toBe('string')
  })

  it('runs the asset-URL backfill on completion (baked CDN URLs → site-owned form)', async () => {
    const bundle = bundleWithStorage({ enabled: false })
    setBlogSettingsBundleForTests(bundle)
    await seedSettingsRows(bundle)
    seedObject(localMem, 'images/a.jpg')

    // Legacy content baked against the CDN base (https://assets.example.com).
    const [postRow] = await db
      .insert(postTable)
      .values({
        slug: 'baked',
        title: 'Baked',
        cover: 'https://assets.example.com/images/a.jpg',
        published: true,
        publishedAt: new Date('2024-01-01'),
        firstPublishedAt: new Date('2024-01-01'),
      })
      .returning({ id: postTable.id })
    await db.insert(contentTable).values({
      type: 'post',
      ownerId: postRow!.id,
      revisionNo: 1,
      status: 'published',
      body: [
        { _type: 'image', _key: 'i1', src: 'https://assets.example.com/images/a.jpg', storagePath: 'images/a.jpg' },
        { _type: 'image', _key: 'i2', src: 'https://external.example/hotlink.jpg' },
      ],
    })

    await startStorageMigration(db, { target: 's3', config: TARGET_CONFIG })
    await __awaitStorageMigrationForTests()

    expect((await getStorageMigrationStatus(db)).phase).toBe('completed')
    const [post] = await db.select({ cover: postTable.cover }).from(postTable).where(eq(postTable.id, postRow!.id))
    expect(post!.cover).toBe('/storage/images/a.jpg')
    const [revision] = await db.select({ body: contentTable.body }).from(contentTable)
    const blocks = revision!.body as { src: string }[]
    expect(blocks[0]!.src).toBe('/storage/images/a.jpg')
    expect(blocks[1]!.src).toBe('https://external.example/hotlink.jpg')
  })
})

describe('storage/s3-migration — s3-to-local', () => {
  it('copies every S3 object back, flips drivers and disables S3', async () => {
    await seedSettingsRows(TEST_BLOG_SETTINGS_BUNDLE)
    seedObject(s3Mem, 'images/b.jpg')
    seedObject(s3Mem, 'musics/t.mp3')
    await seedImageRow('images/b.jpg', 's3')

    await startStorageMigration(db, { target: 'local' })
    await __awaitStorageMigrationForTests()

    const status = await getStorageMigrationStatus(db)
    expect(status.phase).toBe('completed')
    expect(status.direction).toBe('s3-to-local')
    expect(localMem.store.has('images/b.jpg')).toBe(true)
    expect(localMem.store.has('musics/t.mp3')).toBe(true)
    expect(await readDriver('images/b.jpg')).toBe('local')
    expect(getBlogSettingsBundleSync()!.assets!.storage.enabled).toBe(false)
  })

  it('rejects when S3 is not the current primary', async () => {
    setBlogSettingsBundleForTests(bundleWithStorage({ enabled: false }))
    await expect(startStorageMigration(db, { target: 'local' })).rejects.toBeInstanceOf(DomainError)
  })
})

describe('storage/s3-migration — s3-to-s3', () => {
  it('copies objects to the new bucket and swaps only the config', async () => {
    await seedSettingsRows(TEST_BLOG_SETTINGS_BUNDLE)
    seedObject(s3Mem, 'images/c.jpg')
    await seedImageRow('images/c.jpg', 's3')

    await startStorageMigration(db, { target: 's3', config: TARGET_CONFIG })
    await __awaitStorageMigrationForTests()

    const status = await getStorageMigrationStatus(db)
    expect(status.phase).toBe('completed')
    expect(status.direction).toBe('s3-to-s3')
    expect(targetMem.store.has('images/c.jpg')).toBe(true)
    // Same keys — DB rows keep their s3 driver untouched.
    expect(await readDriver('images/c.jpg')).toBe('s3')
    expect(getBlogSettingsBundleSync()!.assets!.storage.bucket).toBe('kobato-new')
  })

  it('rejects an identical target config', async () => {
    const current = TEST_BLOG_SETTINGS_BUNDLE.assets!.storage
    await expect(
      startStorageMigration(db, {
        target: 's3',
        config: {
          enabled: true,
          endpoint: current.endpoint,
          region: current.region,
          bucket: current.bucket,
          accessKeyId: current.accessKeyId,
          secretAccessKey: 'whatever',
          forcePathStyle: current.forcePathStyle,
          urlTemplate: current.urlTemplate,
        },
      }),
    ).rejects.toBeInstanceOf(DomainError)
  })

  it('keeps reading the OLD bucket for catch-up and verification after the config flip', async () => {
    await seedSettingsRows(TEST_BLOG_SETTINGS_BUNDLE)
    seedObject(s3Mem, 'images/old-1.jpg')

    // Observe which config the source backend is bound to…
    let sourceBucket: string | null = null
    // …and simulate a write landing on the OLD bucket during the switch
    // window: the wrapper injects it on the first list after the flip (the
    // live snapshot's bucket becoming 'kobato-new' marks the flip).
    let lateWriteInjected = false
    __setS3MigrationSourceFactoryForTests((config) => {
      sourceBucket = config.bucket
      return {
        ...s3Mem.backend,
        async list(prefix, opts) {
          if (!lateWriteInjected && getBlogSettingsBundleSync()!.assets!.storage.bucket === 'kobato-new') {
            lateWriteInjected = true
            seedObject(s3Mem, 'images/late.jpg')
          }
          return s3Mem.backend.list(prefix, opts)
        },
      }
    })

    await startStorageMigration(db, { target: 's3', config: TARGET_CONFIG })
    await __awaitStorageMigrationForTests()

    // The source backend was built from the pre-flip snapshot, not the live config.
    expect(sourceBucket).toBe('kobato-test')
    // The late write on the OLD bucket was picked up by catch-up.
    expect(lateWriteInjected).toBe(true)
    expect(targetMem.store.has('images/late.jpg')).toBe(true)

    const status = await getStorageMigrationStatus(db)
    expect(status.phase).toBe('completed')
    // Verification compared the real old source (2 objects), not target-vs-target.
    expect(status.verification).toMatchObject({ sourceCount: 2, targetCount: 2, matches: true })
  })

  it('records a mismatching verification when the target holds smaller pre-existing objects', async () => {
    await seedSettingsRows(TEST_BLOG_SETTINGS_BUNDLE)
    seedObject(s3Mem, 'images/dup.jpg')
    // Same key already on the target but with fewer bytes: the copy skips it
    // (existence check), so the final comparison cannot match.
    targetMem.store.set('images/dup.jpg', { body: Buffer.from('x'), contentType: 'application/octet-stream' })

    await startStorageMigration(db, { target: 's3', config: TARGET_CONFIG })
    await __awaitStorageMigrationForTests()

    const status = await getStorageMigrationStatus(db)
    expect(status.phase).toBe('completed')
    expect(status.skippedObjects).toBe(1)
    expect(status.verification).toMatchObject({ sourceCount: 1, targetCount: 1, matches: false })
    expect(status.verification!.targetBytes).toBeLessThan(status.verification!.sourceBytes)
  })
})

describe('storage/s3-migration — header propagation', () => {
  it('copies stored content-type / cache-control verbatim when the source reports them (s3-to-s3)', async () => {
    await seedSettingsRows(TEST_BLOG_SETTINGS_BUNDLE)
    await s3Mem.backend.put({
      key: 'images/v.jpg',
      body: Buffer.from('v'),
      contentType: 'image/jpeg',
      cacheControl: 'public, max-age=60',
    })
    await s3Mem.backend.put({
      key: 'backup/v.db.gz',
      body: Buffer.from('dump'),
      contentType: 'application/gzip',
      cacheControl: 'private, max-age=1',
    })

    await startStorageMigration(db, { target: 's3', config: TARGET_CONFIG })
    await __awaitStorageMigrationForTests()

    expect((await getStorageMigrationStatus(db)).phase).toBe('completed')
    expect(targetMem.store.get('images/v.jpg')).toMatchObject({
      contentType: 'image/jpeg',
      cacheControl: 'public, max-age=60',
    })
    // A private prefix with a stored header keeps THAT header — the prefix
    // rule only applies when the source cannot report one.
    expect(targetMem.store.get('backup/v.db.gz')).toMatchObject({
      contentType: 'application/gzip',
      cacheControl: 'private, max-age=1',
    })
  })

  it('derives cache-control from key visibility and content-type from the extension when the source cannot report headers (local-to-s3)', async () => {
    const bundle = bundleWithStorage({ enabled: false })
    setBlogSettingsBundleForTests(bundle)
    await seedSettingsRows(bundle)
    seedObject(localMem, 'backup/x.db.gz')
    seedObject(localMem, 'images/y.jpg')

    await startStorageMigration(db, { target: 's3', config: TARGET_CONFIG })
    await __awaitStorageMigrationForTests()

    expect((await getStorageMigrationStatus(db)).phase).toBe('completed')
    expect(targetMem.store.get('backup/x.db.gz')).toMatchObject({
      contentType: 'application/gzip',
      cacheControl: DEFAULT_PRIVATE_CACHE_CONTROL,
    })
    expect(targetMem.store.get('images/y.jpg')).toMatchObject({
      contentType: 'image/jpeg',
      cacheControl: DEFAULT_PUBLIC_CACHE_CONTROL,
    })
  })
})

describe('storage/s3-migration — resume / cancel / single-flight', () => {
  it('fails on a broken target and resumes from the cursor', async () => {
    seedObject(s3Mem, 'images/ok-1.jpg')
    seedObject(s3Mem, 'images/bad.jpg')
    seedObject(s3Mem, 'images/ok-2.jpg')

    const broken = makeMemoryBackend()
    const realPutStream = broken.backend.putStream.bind(broken.backend)
    broken.backend.putStream = (input) =>
      input.key === 'images/bad.jpg' ? Promise.reject(new Error('boom')) : realPutStream(input)
    __setS3MigrationTargetFactoryForTests(() => broken.backend)

    await startStorageMigration(db, { target: 's3', config: TARGET_CONFIG })
    await __awaitStorageMigrationForTests()

    const failed = await getStorageMigrationStatus(db)
    expect(failed.phase).toBe('failed')
    expect(failed.error).toContain('images/bad.jpg')

    __setS3MigrationTargetFactoryForTests(() => targetMem.backend)
    await resumeStorageMigration(db)
    await __awaitStorageMigrationForTests()

    const status = await getStorageMigrationStatus(db)
    expect(status.phase).toBe('completed')
    for (const key of ['images/ok-1.jpg', 'images/bad.jpg', 'images/ok-2.jpg']) {
      // ok-1 was copied by the first run; the resume re-lists and copies the rest.
      expect(broken.store.has(key) || targetMem.store.has(key)).toBe(true)
    }
  })

  it('cancels a running migration cooperatively', async () => {
    for (let i = 0; i < 8; i += 1) {
      seedObject(s3Mem, `images/slow-${String(i).padStart(2, '0')}.jpg`)
    }
    const slow = makeMemoryBackend()
    const realPutStream = slow.backend.putStream.bind(slow.backend)
    slow.backend.putStream = async (input) => {
      await new Promise((resolve) => setTimeout(resolve, 25))
      return realPutStream(input)
    }
    __setS3MigrationTargetFactoryForTests(() => slow.backend)

    await startStorageMigration(db, { target: 's3', config: TARGET_CONFIG })
    await cancelStorageMigration(db)
    await __awaitStorageMigrationForTests()

    const status = await getStorageMigrationStatus(db)
    expect(status.phase).toBe('cancelled')
  })

  it('rejects a second start while one is running (single-flight)', async () => {
    const slow = makeMemoryBackend()
    const realPutStream = slow.backend.putStream.bind(slow.backend)
    slow.backend.putStream = async (input) => {
      await new Promise((resolve) => setTimeout(resolve, 25))
      return realPutStream(input)
    }
    seedObject(s3Mem, 'images/hold.jpg')
    __setS3MigrationTargetFactoryForTests(() => slow.backend)

    await startStorageMigration(db, { target: 's3', config: TARGET_CONFIG })
    await expect(startStorageMigration(db, { target: 's3', config: TARGET_CONFIG })).rejects.toMatchObject({
      name: 'DomainError',
      code: 'CONFLICT',
    })

    await cancelStorageMigration(db)
    await __awaitStorageMigrationForTests()
  })

  it('lets exactly one of two concurrent starts pass (synchronous slot claim)', async () => {
    await seedSettingsRows(TEST_BLOG_SETTINGS_BUNDLE)
    seedObject(s3Mem, 'images/race.jpg')

    const results = await Promise.allSettled([
      startStorageMigration(db, { target: 's3', config: TARGET_CONFIG }),
      startStorageMigration(db, { target: 's3', config: TARGET_CONFIG }),
    ])

    const fulfilled = results.filter((r) => r.status === 'fulfilled')
    const rejected = results.filter((r) => r.status === 'rejected')
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
      name: 'DomainError',
      code: 'CONFLICT',
    })

    await __awaitStorageMigrationForTests()
    expect((await getStorageMigrationStatus(db)).phase).toBe('completed')
  })

  it('persists the latest checkpoint cursor when the run fails', async () => {
    // Two listing batches (LIST_BATCH_SIZE = 200): the first completes and
    // checkpoints, the second fails — the persisted cursor must be the first
    // batch's last key, not the original (null) resume point.
    for (let i = 0; i < 200; i += 1) {
      seedObject(s3Mem, `images/obj-${String(i).padStart(3, '0')}.jpg`)
    }
    seedObject(s3Mem, 'images/zzz-fail.jpg')

    const broken = makeMemoryBackend()
    const realPutStream = broken.backend.putStream.bind(broken.backend)
    broken.backend.putStream = (input) =>
      input.key === 'images/zzz-fail.jpg' ? Promise.reject(new Error('boom')) : realPutStream(input)
    __setS3MigrationTargetFactoryForTests(() => broken.backend)

    await startStorageMigration(db, { target: 's3', config: TARGET_CONFIG })
    await __awaitStorageMigrationForTests()

    const rows = await db.select().from(storageMigration).where(eq(storageMigration.id, 1))
    expect(rows[0]!.phase).toBe('failed')
    expect(rows[0]!.cursor).toBe('images/obj-199.jpg')
    expect(rows[0]!.copiedObjects).toBe(200)
  })

  it('stops picking up new keys once a copy failure is observed', async () => {
    // The failing key sorts first; sibling workers block on a gate until the
    // failure has propagated, so any key picked up AFTER the abort would be
    // observable.
    seedObject(s3Mem, 'images/aaa-fail.jpg')
    for (let i = 0; i < 10; i += 1) {
      seedObject(s3Mem, `images/obj-${String(i).padStart(2, '0')}.jpg`)
    }
    const broken = makeMemoryBackend()
    const realPutStream = broken.backend.putStream.bind(broken.backend)
    let releaseGate!: () => void
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve
    })
    broken.backend.putStream = (input) =>
      input.key === 'images/aaa-fail.jpg' ? Promise.reject(new Error('boom')) : gate.then(() => realPutStream(input))
    __setS3MigrationTargetFactoryForTests(() => broken.backend)

    await startStorageMigration(db, { target: 's3', config: TARGET_CONFIG })
    // The failing key exhausts its 3 attempts in ~1s; release the blocked
    // in-flight copies afterwards so the run can settle.
    setTimeout(() => releaseGate(), 1_500)
    await __awaitStorageMigrationForTests()

    const status = await getStorageMigrationStatus(db)
    expect(status.phase).toBe('failed')
    expect(status.error).toContain('images/aaa-fail.jpg')
    // 4 workers: one held the failing key, the other three were mid-copy when
    // the failure landed — the remaining 7 keys were never picked up.
    expect(broken.putKeys).toHaveLength(3)
  })

  it('reports an in-flight row without a running task as interrupted', async () => {
    await db.insert(storageMigration).values({
      id: 1,
      direction: 's3-to-s3',
      targetStorage: null,
      phase: 'copying',
      cursor: 'images/x.jpg',
      startedAt: new Date(),
      updatedAt: new Date(),
    })

    const status = await getStorageMigrationStatus(db)
    expect(status.phase).toBe('interrupted')
    expect(status.direction).toBe('s3-to-s3')
  })
})

describe('settings core — assets storage lock', () => {
  it('rejects structural storage.* changes once S3 is enabled (locked)', async () => {
    await expect(
      updateBlogSettingsSection(db, 'assets', { storage: { endpoint: 'https://evil.example.com' } }, null),
    ).rejects.toMatchObject({ name: 'DomainError', code: 'BAD_REQUEST' })
    // Rejected before any connectivity probe.
    expect(s3Probe.send).not.toHaveBeenCalled()
  })

  it('still rejects bucket / region / toggle changes while locked', async () => {
    await seedSettingsRows(TEST_BLOG_SETTINGS_BUNDLE)
    for (const patch of [
      { storage: { bucket: 'other-bucket' } },
      { storage: { region: 'us-east-1' } },
      { storage: { enabled: false } },
      { storage: { forcePathStyle: true } },
    ]) {
      await expect(updateBlogSettingsSection(db, 'assets', patch, null)).rejects.toMatchObject({
        name: 'DomainError',
        code: 'BAD_REQUEST',
      })
    }
    expect(s3Probe.send).not.toHaveBeenCalled()
  })

  it('accepts a credentials-only patch while locked after a successful probe', async () => {
    await seedSettingsRows(TEST_BLOG_SETTINGS_BUNDLE)

    const result = await updateBlogSettingsSection(
      db,
      'assets',
      { storage: { accessKeyId: 'AKIA-ROTATED', secretAccessKey: 'secret-rotated' } },
      null,
    )

    expect(result.bundle?.assets?.storage.accessKeyId).toBe('AKIA-ROTATED')
    expect(result.bundle?.assets?.storage.secretAccessKey).toBe('secret-rotated')
    // The merged config was connectivity-probed before persisting.
    expect(s3Probe.send).toHaveBeenCalled()
  })

  it('rejects a credentials-only patch while locked when the probe fails', async () => {
    await seedSettingsRows(TEST_BLOG_SETTINGS_BUNDLE)
    s3Probe.send.mockRejectedValue({ name: 'AccessDenied', $metadata: { httpStatusCode: 403 } })

    await expect(
      updateBlogSettingsSection(
        db,
        'assets',
        { storage: { accessKeyId: 'AKIA-BAD', secretAccessKey: 'secret-bad' } },
        null,
      ),
    ).rejects.toMatchObject({ name: 'DomainError', code: 'BAD_REQUEST' })
    // HeadBucket + ListObjectsV2 fallback both probed.
    expect(s3Probe.send).toHaveBeenCalledTimes(2)
  })

  it('accepts a urlTemplate-only patch while locked', async () => {
    await seedSettingsRows(TEST_BLOG_SETTINGS_BUNDLE)

    const result = await updateBlogSettingsSection(
      db,
      'assets',
      { storage: { urlTemplate: 'https://cdn.example.com/{src}?w={width}' } },
      null,
    )

    expect(result.bundle?.assets?.storage.urlTemplate).toBe('https://cdn.example.com/{src}?w={width}')
    expect(s3Probe.send).toHaveBeenCalled()
  })

  it('rejects a locked-state patch that empties a required field (no probe bypass)', async () => {
    await seedSettingsRows(TEST_BLOG_SETTINGS_BUNDLE)

    // accessKeyId / secretAccessKey are exempt fields, but clearing one makes
    // the enabled config incomplete — reject instead of persisting unprobed.
    await expect(updateBlogSettingsSection(db, 'assets', { storage: { accessKeyId: '' } }, null)).rejects.toMatchObject(
      { name: 'DomainError', code: 'BAD_REQUEST' },
    )
    await expect(
      updateBlogSettingsSection(db, 'assets', { storage: { secretAccessKey: '' } }, null),
    ).rejects.toMatchObject({ name: 'DomainError', code: 'BAD_REQUEST' })
    expect(s3Probe.send).not.toHaveBeenCalled()
  })

  it('allows the internal override used by the migration task', async () => {
    await seedSettingsRows(TEST_BLOG_SETTINGS_BUNDLE)
    const result = await updateBlogSettingsSection(
      db,
      'assets',
      { storage: { endpoint: 'https://override.example.com' } },
      null,
      { allowStorageConfigOverride: true },
    )
    expect(result.bundle?.assets?.storage.endpoint).toBe('https://override.example.com')
  })

  it('rejects storage.* patches while a migration is in flight', async () => {
    setBlogSettingsBundleForTests(bundleWithStorage({ enabled: false }))
    await db.insert(storageMigration).values({
      id: 1,
      direction: 'local-to-s3',
      targetStorage: null,
      phase: 'copying',
      startedAt: new Date(),
      updatedAt: new Date(),
    })

    // The probe is injected by the perimeter — pass the real storage-domain
    // predicate, exactly as the settings controller wires it.
    await expect(
      updateBlogSettingsSection(db, 'assets', { storage: { bucket: 'x' } }, null, {
        isStorageMigrationActive: () => isStorageMigrationActive(db),
      }),
    ).rejects.toMatchObject({ name: 'DomainError', code: 'CONFLICT' })
  })

  it('rejects a first-time enable whose config cannot connect', async () => {
    setBlogSettingsBundleForTests(bundleWithStorage({ enabled: false }))
    s3Probe.send.mockRejectedValue(Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNREFUSED' } }))
    await expect(
      updateBlogSettingsSection(
        db,
        'assets',
        {
          storage: {
            enabled: true,
            endpoint: 'https://s3.example.com',
            region: 'auto',
            bucket: 'unreachable',
            accessKeyId: 'AKIA',
            secretAccessKey: 'secret',
            forcePathStyle: true,
            urlTemplate: '',
          },
        },
        null,
      ),
    ).rejects.toMatchObject({ name: 'DomainError', code: 'BAD_REQUEST' })
  })

  it('still allows non-storage assets patches while locked', async () => {
    await seedSettingsRows(TEST_BLOG_SETTINGS_BUNDLE)
    const result = await updateBlogSettingsSection(db, 'assets', { upload: { maxBytes: 4 * 1024 * 1024 } }, null)
    expect(result.bundle?.assets?.upload.maxBytes).toBe(4 * 1024 * 1024)
  })
})

describe('storage/s3-migration — corrupt rows & error paths', () => {
  it('degrades status reads on a corrupt row instead of crashing', async () => {
    const now = new Date()
    await db.insert(storageMigration).values({
      id: 1,
      direction: 'local-to-s3',
      targetStorage: 'not-json{',
      sourceStorage: null,
      phase: 'copying',
      startedAt: now,
      updatedAt: now,
      verification: 'also-bad',
    })

    const status = await getStorageMigrationStatus(db)
    expect(status.phase).toBe('interrupted')
    expect(status.target).toBeNull()
    expect(status.verification).toBeNull()
  })

  it('cancels an interrupted run (in-flight row without an in-memory task)', async () => {
    const now = new Date()
    await db.insert(storageMigration).values({
      id: 1,
      direction: 'local-to-s3',
      targetStorage: null,
      sourceStorage: null,
      phase: 'copying',
      startedAt: now,
      updatedAt: now,
    })

    const status = await cancelStorageMigration(db)
    expect(status.phase).toBe('cancelled')
    expect(status.finishedAt).not.toBeNull()
  })

  it('rejects resume with no row and resume of a completed run', async () => {
    await expect(resumeStorageMigration(db)).rejects.toMatchObject({ name: 'DomainError', code: 'BAD_REQUEST' })

    const now = new Date()
    await db.insert(storageMigration).values({
      id: 1,
      direction: 'local-to-s3',
      targetStorage: null,
      sourceStorage: null,
      phase: 'completed',
      startedAt: now,
      updatedAt: now,
    })
    await expect(resumeStorageMigration(db)).rejects.toMatchObject({
      name: 'DomainError',
      code: 'BAD_REQUEST',
    })
  })

  it('rejects a start while a stale in-flight row exists (no running task)', async () => {
    const now = new Date()
    await db.insert(storageMigration).values({
      id: 1,
      direction: 's3-to-s3',
      targetStorage: null,
      sourceStorage: null,
      phase: 'catching-up',
      startedAt: now,
      updatedAt: now,
    })

    await expect(startStorageMigration(db, { target: 'local' })).rejects.toMatchObject({
      name: 'DomainError',
      code: 'CONFLICT',
    })
  })

  it('completes even when the post-switch backfill hook fails', async () => {
    const bundle = bundleWithStorage({ enabled: false })
    setBlogSettingsBundleForTests(bundle)
    await seedSettingsRows(bundle)
    seedObject(localMem, 'images/a.jpg')
    wireTestHooks(async () => {
      throw new Error('backfill blew up')
    })

    await startStorageMigration(db, { target: 's3', config: TARGET_CONFIG })
    await __awaitStorageMigrationForTests()

    const status = await getStorageMigrationStatus(db)
    expect(status.phase).toBe('completed')
    expect(status.error).toBeNull()
    // The config flip still happened — only the content rewrite was skipped.
    expect(getBlogSettingsBundleSync()!.assets!.storage.enabled).toBe(true)
  })

  it('copies via getStream when the source backend lacks getStreamWithMeta', async () => {
    // s3-to-s3 binds the source through the factory seam — deleting
    // getStreamWithMeta there forces the getStream + key-policy fallback.
    await seedSettingsRows(TEST_BLOG_SETTINGS_BUNDLE)
    seedObject(s3Mem, 'images/a.jpg')

    const legacySource = { ...s3Mem.backend } as Record<string, unknown>
    delete legacySource.getStreamWithMeta
    __setS3MigrationSourceFactoryForTests(() => legacySource as unknown as typeof s3Mem.backend)

    await startStorageMigration(db, { target: 's3', config: TARGET_CONFIG })
    await __awaitStorageMigrationForTests()

    const status = await getStorageMigrationStatus(db)
    expect(status.phase).toBe('completed')
    expect(status.copiedObjects).toBe(1)
    // Extension-derived type + visibility-derived cache header on the target.
    expect(targetMem.store.get('images/a.jpg')).toMatchObject({
      contentType: 'image/jpeg',
      cacheControl: DEFAULT_PUBLIC_CACHE_CONTROL,
    })
  })

  it('reports the lock probe active while a task holds the in-memory slot', async () => {
    seedObject(s3Mem, 'images/hold.jpg')
    const slow = makeMemoryBackend()
    const realPutStream = slow.backend.putStream.bind(slow.backend)
    slow.backend.putStream = async (input) => {
      await new Promise((resolve) => setTimeout(resolve, 25))
      return realPutStream(input)
    }
    __setS3MigrationTargetFactoryForTests(() => slow.backend)

    await startStorageMigration(db, { target: 's3', config: TARGET_CONFIG })
    expect(await isStorageMigrationActive(db)).toBe(true)

    await __awaitStorageMigrationForTests()
    expect(await isStorageMigrationActive(db)).toBe(false)
  })
})
