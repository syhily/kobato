import { describe, expect, it } from 'vitest'

import { TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'
import { SECTION_REGISTRY } from '@/server/domains/settings/sections/registry'
import { SECTION_TO_BUNDLE_KEY, SETTINGS_SECTIONS } from '@/shared/config/sections'

// Contract: every TEST_BLOG_SETTINGS_BUNDLE section must parse against its
// registry schema — the fixture seeds the whole suite's settings snapshot,
// so drift would surface as render/RPC failures far from the cause.
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
