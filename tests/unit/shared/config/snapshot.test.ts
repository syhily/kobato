import { afterEach, describe, expect, it, vi } from 'vitest'

import { TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'
import { BLOG_SETTINGS_SNAPSHOT_SLOT } from '@/shared/config/snapshot'

// The revision is `<bootId>:<zero-padded counter>`: boot-unique (a restart can
// never reuse a previous process's token, even with a backwards clock) and
// strictly monotonic inside one process. Nothing is persisted.

const seq = (revision: string): number => Number(revision.slice(revision.lastIndexOf(':') + 1))
const boot = (revision: string): string => revision.slice(0, revision.lastIndexOf(':'))

describe('shared/config/snapshot — revision token', () => {
  afterEach(() => {
    BLOG_SETTINGS_SNAPSHOT_SLOT.write(TEST_BLOG_SETTINGS_BUNDLE)
  })

  it('is `<bootId>:<zero-padded counter>`, with an explicit pre-install token', () => {
    BLOG_SETTINGS_SNAPSHOT_SLOT.write(null)
    const preInstall = BLOG_SETTINGS_SNAPSHOT_SLOT.readSnapshot()

    expect(preInstall.bundle).toBeNull()
    expect(preInstall.revision).toMatch(/^.+:\d{10}$/)
  })

  it('increments the counter in place without changing the boot id', () => {
    BLOG_SETTINGS_SNAPSHOT_SLOT.write(TEST_BLOG_SETTINGS_BUNDLE)
    const first = BLOG_SETTINGS_SNAPSHOT_SLOT.readSnapshot()

    BLOG_SETTINGS_SNAPSHOT_SLOT.write(TEST_BLOG_SETTINGS_BUNDLE)
    const second = BLOG_SETTINGS_SNAPSHOT_SLOT.readSnapshot()

    expect(boot(second.revision)).toBe(boot(first.revision))
    expect(seq(second.revision)).toBe(seq(first.revision) + 1)
    // Zero-padded width keeps lexicographic order meaningful in-process.
    expect(second.revision > first.revision).toBe(true)
  })

  it('mints a different boot id per module evaluation (a restart never reuses tokens)', async () => {
    async function freshBootRevision(): Promise<string> {
      vi.resetModules()
      const { BLOG_SETTINGS_SNAPSHOT_SLOT: freshSlot } = await import('@/shared/config/snapshot')
      freshSlot.write(TEST_BLOG_SETTINGS_BUNDLE)
      return freshSlot.readSnapshot().revision
    }

    const first = await freshBootRevision()
    const second = await freshBootRevision()

    expect(boot(first)).not.toBe(boot(second))
  })
})
