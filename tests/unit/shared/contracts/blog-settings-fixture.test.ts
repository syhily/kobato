import { describe, expect, it } from 'vitest'

import { TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'
import { SECTION_REGISTRY } from '@/server/domains/settings/sections/registry'
import { SECTION_TO_BUNDLE_KEY, SETTINGS_SECTIONS } from '@/shared/config/sections'

// Contract: every `TEST_BLOG_SETTINGS_BUNDLE` section must parse against
// its registry section schema. The fixture seeds the in-process settings
// snapshot for the whole suite (unit / it / snaps setups), so a frozen
// value that drifted out of its schema would surface as confusing render
// or RPC failures dozens of tests away from the cause. Sections that
// import the registry defaults can't drift structurally, but the
// deliberate historical freezes (siteIdentity / assets / navigation /
// socials / content / sidebar / comments / cache / search / fonts) can —
// this parses ALL of them so the drift fails loudly here instead.
describe('contract: blog-settings fixture matches the section registry', () => {
  it('provides a non-null value for every declared section', () => {
    for (const section of SETTINGS_SECTIONS) {
      const key = SECTION_TO_BUNDLE_KEY[section]
      expect(
        TEST_BLOG_SETTINGS_BUNDLE[key],
        `fixture is missing bundle slot '${key}' (section '${section}')`,
      ).not.toBeNull()
    }
  })

  it.each(SETTINGS_SECTIONS)("fixture section '%s' parses against its registry schema", (section) => {
    const meta = SECTION_REGISTRY[section]
    const value = TEST_BLOG_SETTINGS_BUNDLE[SECTION_TO_BUNDLE_KEY[section]]
    const result = meta.schema.safeParse(value)
    expect(result.success ? null : result.error.issues).toBeNull()
  })
})
