import { describe, expect, it } from 'vitest'

import { buildPageUpsertPayload } from '@/ui/pages/build-page-upsert-payload'
import { EMPTY_PAGE_META_DRAFT } from '@/ui/pages/page-meta'
import { buildPostUpsertPayload } from '@/ui/posts/build-post-upsert-payload'
import { EMPTY_POST_META_DRAFT } from '@/ui/posts/post-meta'

describe('upsert payloads — contentLanguage', () => {
  it('sends a trimmed valid tag verbatim for post and page', () => {
    const post = buildPostUpsertPayload({
      meta: { ...EMPTY_POST_META_DRAFT, title: 'T', contentLanguage: ' zh-hant-tw ' },
    })
    expect(post.contentLanguage).toBe('zh-hant-tw')

    const page = buildPageUpsertPayload({ meta: { ...EMPTY_PAGE_META_DRAFT, title: 'T', contentLanguage: 'ja' } })
    expect(page.contentLanguage).toBe('ja')
  })

  it('clears an empty field with an explicit null', () => {
    expect(buildPostUpsertPayload({ meta: { ...EMPTY_POST_META_DRAFT, title: 'T' } }).contentLanguage).toBeNull()
    expect(buildPageUpsertPayload({ meta: { ...EMPTY_PAGE_META_DRAFT, title: 'T' } }).contentLanguage).toBeNull()
  })

  it('omits a malformed tag instead of failing the whole save', () => {
    const post = buildPostUpsertPayload({ meta: { ...EMPTY_POST_META_DRAFT, title: 'T', contentLanguage: 'zh_CN' } })
    expect('contentLanguage' in post).toBe(false)

    const page = buildPageUpsertPayload({
      meta: { ...EMPTY_PAGE_META_DRAFT, title: 'T', contentLanguage: 'not a tag' },
    })
    expect('contentLanguage' in page).toBe(false)
  })
})
