import { describe, expect, it } from 'vitest'

import type { ErrorMessageParams } from '@/shared/contracts/api-error'
import type { AppLocale } from '@/shared/i18n/locales'
import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'

import { descriptorFor } from '@/server/infra/http/error-descriptor'
import { createServerTranslator } from '@/server/infra/i18n'
import { SUPPORTED_LOCALES } from '@/shared/i18n/locales'

// The content/taxonomy noun is a MACHINE kind ('post' | 'page' | 'category' |
// 'tag') — the catalog's ICU `select` renders it per locale. These cases pin
// the select/plural output in all four locales and the English fallbacks.

interface Case {
  key: UiMessageId
  params?: ErrorMessageParams
  messages: Record<AppLocale, string>
}

const CASES: Case[] = [
  {
    key: 'content.error.entityNotFound',
    params: { entity: 'post' },
    messages: {
      'en-US': 'The post does not exist or has been deleted.',
      'zh-CN': '文章不存在或已被删除。',
      'zh-TW': '文章不存在或已被刪除。',
      'zh-HK': '文章不存在或已被刪除。',
    },
  },
  {
    key: 'content.error.entityNotFound',
    params: { entity: 'page' },
    messages: {
      'en-US': 'The page does not exist or has been deleted.',
      'zh-CN': '页面不存在或已被删除。',
      'zh-TW': '頁面不存在或已被刪除。',
      'zh-HK': '頁面不存在或已被刪除。',
    },
  },
  {
    key: 'content.error.entityNotDeleted',
    params: { entity: 'post' },
    messages: {
      'en-US': 'The post does not exist or is not deleted.',
      'zh-CN': '文章不存在或未被删除。',
      'zh-TW': '文章不存在或未被刪除。',
      'zh-HK': '文章不存在或未被刪除。',
    },
  },
  {
    key: 'content.warning.slugTakenOnRestore',
    params: { slug: 'hello', occupant: 'page', target: 'post' },
    messages: {
      'en-US':
        'slug "hello" is already used by another page; after restoring, that URL will not point to this post. Change the slug or handle the occupant first.',
      'zh-CN': 'slug「hello」已被另一个页面占用，恢复后该 URL 不会指向此文章。请修改 slug 或先处理占用方。',
      'zh-TW': 'slug「hello」已被另一個頁面占用，還原後該 URL 不會指向此文章。請修改 slug 或先處理佔用方。',
      'zh-HK': 'slug「hello」已被另一個頁面占用，還原後該 URL 不會指向此文章。請修改 slug 或先處理佔用方。',
    },
  },
  {
    key: 'content.warning.slugStolenOnRestore',
    params: { slug: 'hello', target: 'page' },
    messages: {
      'en-US': 'slug "hello" was taken by other content during the restore; the URL will not point to this page.',
      'zh-CN': 'slug「hello」在恢复过程中被其它内容占用，URL 不会指向此页面。',
      'zh-TW': 'slug「hello」在還原過程中被其他內容占用，URL 不會指向此頁面。',
      'zh-HK': 'slug「hello」在還原過程中被其他內容占用，URL 不會指向此頁面。',
    },
  },
  {
    key: 'taxonomy.error.nameTaken',
    params: { entity: 'tag', name: 'React' },
    messages: {
      'en-US': 'A tag named "React" already exists',
      'zh-CN': '已存在同名标签「React」',
      'zh-TW': '已存在同名標籤「React」',
      'zh-HK': '已存在同名標籤「React」',
    },
  },
  {
    key: 'taxonomy.error.nameTaken',
    params: { entity: 'category', name: 'Tech' },
    messages: {
      'en-US': 'A category named "Tech" already exists',
      'zh-CN': '已存在同名分类「Tech」',
      'zh-TW': '已存在同名分類「Tech」',
      'zh-HK': '已存在同名分類「Tech」',
    },
  },
  {
    key: 'taxonomy.error.notFound',
    params: { entity: 'category' },
    messages: {
      'en-US': 'Category not found',
      'zh-CN': '分类不存在',
      'zh-TW': '分類不存在',
      'zh-HK': '分類不存在',
    },
  },
  {
    key: 'taxonomy.error.blockedByPosts',
    params: { entity: 'category', name: 'Tech', count: 2, preview: 'a, b' },
    messages: {
      'en-US': 'Category "Tech" is still referenced by 2 posts: a, b. Update those posts before deleting.',
      'zh-CN': '分类「Tech」仍被 2 篇文章引用：a, b。请先在引用文章中修改后再删除。',
      'zh-TW': '分類「Tech」仍被 2 篇文章引用：a, b。請先在引用文章中修改後再刪除。',
      'zh-HK': '分類「Tech」仍被 2 篇文章引用：a, b。請先在引用文章中修改後再刪除。',
    },
  },
  {
    key: 'taxonomy.error.blockedByPosts',
    params: { entity: 'tag', name: 'React', count: 1, preview: 'only' },
    messages: {
      'en-US': 'Tag "React" is still referenced by 1 post: only. Update those posts before deleting.',
      'zh-CN': '标签「React」仍被 1 篇文章引用：only。请先在引用文章中修改后再删除。',
      'zh-TW': '標籤「React」仍被 1 篇文章引用：only。請先在引用文章中修改後再刪除。',
      'zh-HK': '標籤「React」仍被 1 篇文章引用：only。請先在引用文章中修改後再刪除。',
    },
  },
  {
    key: 'content.error.slugFormat',
    params: { entity: 'taxonomy' },
    messages: {
      'en-US': 'Slug slug format is invalid (lowercase letters, digits and `-` only).',
      'zh-CN': 'Slug slug 格式不合法（仅允许小写字母、数字、`-`）。',
      'zh-TW': 'Slug slug 格式不合法（僅允許小寫字母、數字、`-`）。',
      'zh-HK': 'Slug slug 格式不合法（僅允許小寫字母、數字、`-`）。',
    },
  },
]

describe('content + taxonomy messages — entity select and plural, four locales', () => {
  it.each(CASES)('$key ($params) resolves in every locale', ({ key, params, messages }) => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(createServerTranslator(locale).format(key, params)).toBe(messages[locale])
    }
  })

  it.each(CASES)('$key keeps an English fallback with no Han characters', ({ key, params }) => {
    const descriptor = descriptorFor(key, params)
    expect(descriptor.fallbackMessage).toBe(createServerTranslator('en-US').format(key, params))
    expect(descriptor.fallbackMessage).not.toMatch(/[\u3400-\u4DBF\u4E00-\u9FFF]/)
  })
})
