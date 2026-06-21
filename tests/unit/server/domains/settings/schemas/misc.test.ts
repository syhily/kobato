import { describe, expect, it } from 'vitest'

import { analyticsSchema } from '@/server/domains/settings/schemas/analytics'
import { commentsSchema } from '@/server/domains/settings/schemas/comments'
import { contentSchema } from '@/server/domains/settings/schemas/content'
import { corsSchema } from '@/server/domains/settings/schemas/cors'
import { fontsSchema } from '@/server/domains/settings/schemas/fonts'
import { limitsSchema } from '@/server/domains/settings/schemas/limits'
import { mailSchema } from '@/server/domains/settings/schemas/mail'
import { sendTestMailSchema } from '@/server/domains/settings/schemas/send-test-mail'
import { seoSchema } from '@/server/domains/settings/schemas/seo'
import { sidebarSchema } from '@/server/domains/settings/schemas/sidebar'
import { socialsSchema } from '@/server/domains/settings/schemas/socials'

describe('settings/schemas/cors', () => {
  it('accepts a valid payload', () => {
    const result = corsSchema.safeParse({ cors: { enabled: true, origins: ['https://a.example'] } })
    expect(result.success).toBe(true)
  })

  it('defaults origins to an empty array when omitted', () => {
    const result = corsSchema.safeParse({ cors: { enabled: false } })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.cors.origins).toEqual([])
    }
  })

  it('rejects more than 20 origins', () => {
    const origins = Array.from({ length: 21 }, (_, i) => `https://${i}.example`)
    expect(corsSchema.safeParse({ cors: { enabled: true, origins } }).success).toBe(false)
  })

  it('rejects empty-string origins', () => {
    expect(corsSchema.safeParse({ cors: { enabled: true, origins: [''] } }).success).toBe(false)
  })
})

describe('settings/schemas/mail', () => {
  it('accepts a fully-populated payload', () => {
    const result = mailSchema.safeParse({
      mail: { enabled: true, host: 'example.com', apiKey: 'k', sender: 'a@b.com', transport: 'zeabur' },
    })
    expect(result.success).toBe(true)
  })

  it('defaults transport to "zeabur" when omitted', () => {
    const result = mailSchema.safeParse({ mail: { enabled: false, host: 'h', sender: '' } })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.mail.transport).toBe('zeabur')
    }
  })

  it('accepts empty string as a valid sender (no reply address)', () => {
    expect(mailSchema.safeParse({ mail: { enabled: false, host: 'h', sender: '' } }).success).toBe(true)
  })

  it('rejects an invalid sender email', () => {
    expect(mailSchema.safeParse({ mail: { enabled: false, host: 'h', sender: 'not-an-email' } }).success).toBe(false)
  })

  it('rejects an unknown transport', () => {
    expect(
      mailSchema.safeParse({
        mail: { enabled: false, host: 'h', sender: '', transport: 'sendgrid' },
      }).success,
    ).toBe(false)
  })

  it('allows an empty host so the provider can be switched without filling fields first', () => {
    expect(mailSchema.safeParse({ mail: { enabled: false, host: '', sender: '' } }).success).toBe(true)
  })
})

describe('settings/schemas/comments', () => {
  it('accepts a valid payload and applies the default tokenTtlSeconds', () => {
    const result = commentsSchema.safeParse({
      comments: { size: 10, avatar: { mirror: 'https://gravatar.com/avatar/', size: 80 } },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.comments.tokenTtlSeconds).toBe(1800)
    }
  })

  it('rejects an unknown gravatar mirror', () => {
    expect(
      commentsSchema.safeParse({
        comments: { size: 10, avatar: { mirror: 'https://evil.example/avatar/', size: 80 } },
      }).success,
    ).toBe(false)
  })

  it('rejects size below 1 or above 100', () => {
    expect(
      commentsSchema.safeParse({
        comments: { size: 0, avatar: { mirror: 'https://gravatar.com/avatar/', size: 80 } },
      }).success,
    ).toBe(false)
    expect(
      commentsSchema.safeParse({
        comments: { size: 101, avatar: { mirror: 'https://gravatar.com/avatar/', size: 80 } },
      }).success,
    ).toBe(false)
  })

  it('rejects avatar size outside 16..512', () => {
    expect(
      commentsSchema.safeParse({
        comments: { size: 5, avatar: { mirror: 'https://gravatar.com/avatar/', size: 8 } },
      }).success,
    ).toBe(false)
  })

  it('rejects tokenTtlSeconds outside 60..86400', () => {
    expect(
      commentsSchema.safeParse({
        comments: {
          size: 5,
          avatar: { mirror: 'https://gravatar.com/avatar/', size: 80 },
          tokenTtlSeconds: 10,
        },
      }).success,
    ).toBe(false)
  })
})

describe('settings/schemas/content', () => {
  it('accepts a valid payload', () => {
    const result = contentSchema.safeParse({
      pagination: { posts: 10, category: 20, tags: 30, search: 40 },
      feed: { full: true, size: 50 },
      post: { sort: 'desc', sortBy: 'publishedAt', featureEnabled: true },
    })
    expect(result.success).toBe(true)
  })

  it('applies defaults for post.featureEnabled and footnotes', () => {
    const result = contentSchema.safeParse({
      pagination: { posts: 10, category: 20, tags: 30, search: 40 },
      feed: { full: true, size: 50 },
      post: { sort: 'desc' },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.post.featureEnabled).toBe(false)
      expect(result.data.post.sortBy).toBe('publishedAt')
      expect(result.data.footnotes.sectionTitle).toBe('尾声礼记')
    }
  })

  it('rejects an unknown sort order', () => {
    expect(
      contentSchema.safeParse({
        pagination: { posts: 10, category: 20, tags: 30, search: 40 },
        feed: { full: true, size: 50 },
        post: { sort: 'sideways' as never },
      }).success,
    ).toBe(false)
  })

  it('rejects pagination sizes outside 1..100', () => {
    expect(
      contentSchema.safeParse({
        pagination: { posts: 0, category: 20, tags: 30, search: 40 },
        feed: { full: true, size: 50 },
      }).success,
    ).toBe(false)
  })
})

describe('settings/schemas/analytics', () => {
  it('accepts the boolean flags', () => {
    const result = analyticsSchema.safeParse({ analytics: { trackAdmin: false, keepBotRows: true } })
    expect(result.success).toBe(true)
  })

  it('coerces string booleans', () => {
    const result = analyticsSchema.safeParse({ analytics: { trackAdmin: 'true', keepBotRows: 'false' } })
    expect(result.success).toBe(true)
  })
})

describe('settings/schemas/send-test-mail', () => {
  it('accepts a valid email', () => {
    expect(sendTestMailSchema.safeParse({ to: 'a@b.com' }).success).toBe(true)
  })

  it('rejects an invalid email', () => {
    expect(sendTestMailSchema.safeParse({ to: 'not-an-email' }).success).toBe(false)
  })
})

describe('settings/schemas/seo', () => {
  it('accepts valid toc + og dimensions', () => {
    const result = seoSchema.safeParse({
      toc: { minHeadingLevel: 2, maxHeadingLevel: 4 },
      og: { width: 1200, height: 630 },
    })
    expect(result.success).toBe(true)
  })

  it('rejects og width below 600', () => {
    expect(
      seoSchema.safeParse({ toc: { minHeadingLevel: 2, maxHeadingLevel: 4 }, og: { width: 500, height: 630 } }).success,
    ).toBe(false)
  })

  it('rejects heading levels outside 1..6', () => {
    expect(
      seoSchema.safeParse({ toc: { minHeadingLevel: 0, maxHeadingLevel: 4 }, og: { width: 1200, height: 630 } })
        .success,
    ).toBe(false)
  })
})

describe('settings/schemas/fonts', () => {
  it('accepts empty family and CSS arrays', () => {
    const result = fontsSchema.safeParse({
      og: { family: '' },
      calendar: { family: '' },
      postFamily: '',
      globalCss: [],
      postCss: [],
    })
    expect(result.success).toBe(true)
  })

  it('accepts valid family names and CSS URLs', () => {
    const result = fontsSchema.safeParse({
      og: { family: 'NotoSans' },
      calendar: { family: 'Noto-Serif' },
      postFamily: 'Noto-Serif',
      globalCss: ['https://fonts.example/og.css'],
      postCss: ['https://fonts.example/post.css'],
    })
    expect(result.success).toBe(true)
  })

  it('rejects family names with spaces', () => {
    expect(
      fontsSchema.safeParse({
        og: { family: 'has space' },
        calendar: { family: '' },
        postFamily: '',
        globalCss: [],
        postCss: [],
      }).success,
    ).toBe(false)
  })

  it('rejects more than 8 css entries', () => {
    const css = Array.from({ length: 9 }, () => 'https://fonts.example/a.css')
    expect(
      fontsSchema.safeParse({
        og: { family: '' },
        calendar: { family: '' },
        postFamily: '',
        globalCss: css,
        postCss: [],
      }).success,
    ).toBe(false)
  })
})

describe('settings/schemas/limits', () => {
  it('applies defaults when fields are omitted', () => {
    const result = limitsSchema.safeParse({})
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.maxRequestBodySize).toBe(10 * 1024 * 1024)
      expect(result.data.sessionMaxAge).toBe(60 * 60 * 24 * 30)
      expect(result.data.auditLogDbRetentionDays).toBe(30)
      expect(result.data.auditLogArchiveRetentionDays).toBe(180)
    }
  })

  it('rejects maxRequestBodySize below 1KB', () => {
    expect(limitsSchema.safeParse({ maxRequestBodySize: 100 }).success).toBe(false)
  })

  it('rejects sessionMaxAge below 60 seconds', () => {
    expect(limitsSchema.safeParse({ sessionMaxAge: 30 }).success).toBe(false)
  })

  it('rejects audit db retention above 90 days', () => {
    expect(limitsSchema.safeParse({ auditLogDbRetentionDays: 120 }).success).toBe(false)
  })
})

describe('settings/schemas/sidebar', () => {
  it('accepts an empty widget list', () => {
    expect(sidebarSchema.safeParse({ sidebar: { widgets: [] } }).success).toBe(true)
  })

  it('accepts widgets of every known type with optional count', () => {
    const result = sidebarSchema.safeParse({
      sidebar: {
        widgets: [
          { type: 'search', enabled: true },
          { type: 'recentPosts', enabled: true, count: 5 },
          { type: 'recentComments', enabled: false },
          { type: 'randomTags', enabled: true, count: 10 },
          { type: 'todayCalendar', enabled: true },
        ],
      },
    })
    expect(result.success).toBe(true)
  })

  it('rejects an unknown widget type', () => {
    expect(
      sidebarSchema.safeParse({
        sidebar: { widgets: [{ type: 'unknown' as never, enabled: true }] },
      }).success,
    ).toBe(false)
  })

  it('rejects count above 100', () => {
    expect(
      sidebarSchema.safeParse({
        sidebar: { widgets: [{ type: 'recentPosts', enabled: true, count: 101 }] },
      }).success,
    ).toBe(false)
  })
})

describe('settings/schemas/socials', () => {
  it('accepts an empty list', () => {
    const result = socialsSchema.safeParse({ socials: [] })
    expect(result.success).toBe(true)
  })

  it('accepts valid link and qrcode rows', () => {
    const result = socialsSchema.safeParse({
      socials: [
        { network: 'github', name: 'GitHub', type: 'link', url: 'https://github.com/me' },
        { network: 'wechat', name: '微信', type: 'qrcode', url: 'https://u.wechat.com/abc' },
      ],
    })
    expect(result.success).toBe(true)
  })
})
