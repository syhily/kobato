import { afterEach, describe, expect, it } from 'vitest'

import { TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'
import {
  getBlogSettingsBundleSync,
  getBlogSettingsSnapshotSync,
  isWebmentionReceiveEnabled,
  requireBlogSettingsBundle,
  requireBlogSettingsSection,
} from '@/shared/config/getters'
import { BLOG_SETTINGS_SNAPSHOT_SLOT } from '@/shared/config/snapshot'

const SECTION_KEYS = Object.keys(TEST_BLOG_SETTINGS_BUNDLE) as Array<keyof typeof TEST_BLOG_SETTINGS_BUNDLE>

describe('shared/config/getters — getBlogSettingsBundleSync', () => {
  afterEach(() => {
    BLOG_SETTINGS_SNAPSHOT_SLOT.write(TEST_BLOG_SETTINGS_BUNDLE)
  })

  it('returns null when the snapshot has not been hydrated', () => {
    BLOG_SETTINGS_SNAPSHOT_SLOT.write(null)
    expect(getBlogSettingsBundleSync()).toBeNull()
  })

  it('returns the hydrated bundle', () => {
    BLOG_SETTINGS_SNAPSHOT_SLOT.write(TEST_BLOG_SETTINGS_BUNDLE)
    expect(getBlogSettingsBundleSync()).toBe(TEST_BLOG_SETTINGS_BUNDLE)
  })
})

describe('shared/config/getters — requireBlogSettingsBundle', () => {
  afterEach(() => {
    BLOG_SETTINGS_SNAPSHOT_SLOT.write(TEST_BLOG_SETTINGS_BUNDLE)
  })

  it('throws when the snapshot is null', () => {
    BLOG_SETTINGS_SNAPSHOT_SLOT.write(null)
    expect(() => requireBlogSettingsBundle()).toThrow(/not been hydrated/)
  })

  it('returns the bundle when hydrated', () => {
    expect(requireBlogSettingsBundle()).toBe(TEST_BLOG_SETTINGS_BUNDLE)
  })
})

describe('shared/config/getters — snapshot revision', () => {
  afterEach(() => {
    BLOG_SETTINGS_SNAPSHOT_SLOT.write(TEST_BLOG_SETTINGS_BUNDLE)
  })

  it('advances by exactly one on every successful write and never decreases', () => {
    const seq = (revision: string): number => Number(revision.slice(revision.lastIndexOf(':') + 1))
    const boot = (revision: string): string => revision.slice(0, revision.lastIndexOf(':'))

    BLOG_SETTINGS_SNAPSHOT_SLOT.write(TEST_BLOG_SETTINGS_BUNDLE)
    const first = getBlogSettingsSnapshotSync()
    expect(first.bundle).toBe(TEST_BLOG_SETTINGS_BUNDLE)
    expect(boot(first.revision)).toMatch(/[\w-]+/)

    BLOG_SETTINGS_SNAPSHOT_SLOT.write(TEST_BLOG_SETTINGS_BUNDLE)
    const second = getBlogSettingsSnapshotSync()
    expect(boot(second.revision)).toBe(boot(first.revision))
    expect(seq(second.revision)).toBe(seq(first.revision) + 1)

    // The pre-install snapshot has its own explicit revision too.
    BLOG_SETTINGS_SNAPSHOT_SLOT.write(null)
    const third = getBlogSettingsSnapshotSync()
    expect(third.bundle).toBeNull()
    expect(boot(third.revision)).toBe(boot(second.revision))
    expect(seq(third.revision)).toBe(seq(second.revision) + 1)
  })

  it('reads bundle and revision from one call', () => {
    BLOG_SETTINGS_SNAPSHOT_SLOT.write(TEST_BLOG_SETTINGS_BUNDLE)
    const snapshot = getBlogSettingsSnapshotSync()
    expect(snapshot).toEqual({
      bundle: TEST_BLOG_SETTINGS_BUNDLE,
      revision: expect.any(String) as string,
    })
  })
})

describe('shared/config/getters — requireBlogSettingsSection', () => {
  it('returns every populated section of the test bundle', () => {
    for (const key of SECTION_KEYS) {
      const value = TEST_BLOG_SETTINGS_BUNDLE[key]
      if (value === null) {
        continue
      }
      expect(requireBlogSettingsSection(key)).toBe(value)
    }
  })

  it('throws when the section value is null', () => {
    BLOG_SETTINGS_SNAPSHOT_SLOT.write({ ...TEST_BLOG_SETTINGS_BUNDLE, mail: null })
    expect(() => requireBlogSettingsSection('mail')).toThrow(/missing from the snapshot/)
  })

  it('reads from an explicit pinned bundle, never the process snapshot', () => {
    const explicit = { ...TEST_BLOG_SETTINGS_BUNDLE, siteIdentity: null }
    expect(() => requireBlogSettingsSection('siteIdentity', explicit)).toThrow(/missing from the snapshot/)
    expect(requireBlogSettingsSection('content', explicit)).toBe(TEST_BLOG_SETTINGS_BUNDLE.content)
    expect(() => requireBlogSettingsSection('content', null)).toThrow(/not been hydrated/)
  })
})

describe('shared/config/getters — isWebmentionReceiveEnabled', () => {
  // The core invariant the receive-side surfaces share: an unseeded
  // section reads as the schema default ON, so discovery (`<link>` /
  // Link header), the 410 gate, and the inbox drain can never disagree.
  it('defaults to ON for every unseeded shape', () => {
    expect(isWebmentionReceiveEnabled(undefined)).toBe(true)
    expect(isWebmentionReceiveEnabled(null)).toBe(true)
    expect(isWebmentionReceiveEnabled({})).toBe(true)
    expect(isWebmentionReceiveEnabled({ webmentions: null })).toBe(true)
    expect(isWebmentionReceiveEnabled({ webmentions: { webmention: {} } })).toBe(true)
  })

  it('reads the explicit switch both ways', () => {
    expect(isWebmentionReceiveEnabled({ webmentions: { webmention: { receiveEnabled: true } } })).toBe(true)
    expect(isWebmentionReceiveEnabled({ webmentions: { webmention: { receiveEnabled: false } } })).toBe(false)
  })
})
