import { describe, expect, it } from 'vitest'

import { EMPTY_PAGE_META_DRAFT } from '@/shared/types/pages'
import { EMPTY_POST_META_DRAFT } from '@/shared/types/posts'
import { buildPageUpsertPayload } from '@/ui/admin/pages/build-page-upsert-payload'
import { buildPostUpsertPayload } from '@/ui/admin/posts/build-post-upsert-payload'

// The editor never sends a tag the server would reject: one bad field must not
// fail an otherwise valid meta/body save. The field shows the inline error and
// the stored value stays untouched (omitted key = leave untouched).

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
