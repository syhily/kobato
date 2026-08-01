import { afterEach, describe, expect, it } from 'vitest'

import { TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'
import {
  getBlogSettingsBundleSync,
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
})
