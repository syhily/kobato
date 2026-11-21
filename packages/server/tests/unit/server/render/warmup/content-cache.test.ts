import type { BlogSettingsBundle } from '@kobato/settings/types'

import { warmContentRenderCaches } from '@kobato/server/domains/content/render-warmup'
import { countEntryFiles } from '@kobato/server/infra/cache/file-store'
import { clear } from '@kobato/server/infra/cache/registry'
import { __clearLogCaptureForTests, __logCaptureForTests } from '@kobato/server/infra/logger'
import {
  TEST_BLOG_SETTINGS_BUNDLE,
  resetBlogSettingsForTests,
  setBlogSettingsBundleForTests,
} from '@kobato/settings/tests/utils/blog-settings'
import '@kobato/server/render/warmup/content-cache'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const BUNDLE: BlogSettingsBundle = structuredClone(TEST_BLOG_SETTINGS_BUNDLE)
BUNDLE.sidebar!.sidebar.dailyQuote.source = 'local'

afterAll(() => {
  resetBlogSettingsForTests()
})

beforeEach(() => {
  setBlogSettingsBundleForTests(BUNDLE)
  __clearLogCaptureForTests()
  clear('og')
  clear('calendar')
})

function captured(msg: string) {
  return __logCaptureForTests().filter((entry) => entry.msg === msg)
}

const PNG_1X1 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

const og = { slug: 'hello', title: 'Hello', summary: 'World', cover: PNG_1X1 }

describe('render/warmup/content-cache (through the domain seam)', () => {
  it('warms the OG bucket with the request-path render inputs', async () => {
    warmContentRenderCaches(og)

    await vi.waitFor(async () => {
      expect(await countEntryFiles('og')).toBeGreaterThan(0)
    })
    expect(captured('OG render warmup failed')).toHaveLength(0)
  })

  it('warms today’s calendar in both themes', async () => {
    warmContentRenderCaches(og)

    await vi.waitFor(async () => {
      expect(await countEntryFiles('calendar')).toBeGreaterThanOrEqual(2)
    })
    expect(captured('calendar render warmup failed')).toHaveLength(0)
  })

  it('swallows a failed OG render — the warm never reaches its trigger', async () => {
    expect(() =>
      warmContentRenderCaches({ slug: 'hello', title: 'Hello', summary: 'World', cover: 'ftp://example.com/x.png' }),
    ).not.toThrow()

    await vi.waitFor(() => {
      expect(captured('OG render warmup failed')).toHaveLength(1)
    })
    const warn = captured('OG render warmup failed')[0]
    expect(warn.ctx).toMatchObject({ slug: 'hello' })
    expect(warn.level).toBe('warn')
    expect(captured('Unhandled promise rejection')).toHaveLength(0)
  })
})
