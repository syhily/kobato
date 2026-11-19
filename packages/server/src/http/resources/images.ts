import type { Env } from '@kobato/server/http/hono-env.ts'
import type { Context } from 'hono'

import { defaultAvatarUrl, resolveAvatarSize, serveAvatar } from '@kobato/server/domains/comments/services/avatar.ts'
import { isLive } from '@kobato/server/domains/content/schemas/live-gate.ts'
import { findPublicPageMetaBySlug } from '@kobato/server/domains/pages/services/public-query.ts'
import { findPublicPostMetaBySlug } from '@kobato/server/domains/posts/services/single.ts'
import { findCategoryBySlug } from '@kobato/server/domains/taxonomies/categories/services/query.ts'
import { rateLimitByIp, rateLimitByRequestKey } from '@kobato/server/http/middlewares/rate-limit.ts'
import { serveCalendar } from '@kobato/server/http/resources/calendar.ts'
import { through } from '@kobato/server/infra/cache/registry.ts'
import { drawOpenGraph } from '@kobato/server/render/og/render.ts'
import { requireBlogSettingsSection } from '@kobato/settings/getters.ts'
// Side-effect: wires render-layer warmup into the content domain's slot
// (this module owns the OG/calendar request path it mirrors).
import '@kobato/server/render/warmup/content-cache.ts'
import { brandingVersionSuffix } from '@kobato/settings/presentation.ts'
import { joinUrl } from '@kobato/utils/urls.ts'
import { Hono } from 'hono'

// Slug-keyed OG URLs outlive the image content — `immutable` would pin stale cards; short max-age revalidates.
const OG_HEADERS = {
  'Cache-Control': 'public, max-age=3600',
}

function respondPng(c: Context<Env>, buffer: Uint8Array, headers: Readonly<Record<string, string>>) {
  c.header('Content-Type', 'image/png')
  Object.entries(headers).forEach(([key, value]) => c.header(key, value))
  return c.body(new Uint8Array(buffer))
}

function ogFallback(c: Context<Env>) {
  // Pinned request snapshot — never the global one.
  const { settings } = c.var.requestContext
  const suffix = brandingVersionSuffix(settings?.assets?.branding?.openGraph)
  return c.redirect(
    joinUrl(requireBlogSettingsSection('siteIdentity', settings).website, `/images/open-graph.png${suffix}`),
  )
}

interface OgEntity {
  title: string
  summary: string
  cover: string
}

interface OgAdapter {
  cacheKeyPrefix: string
  useSiteSummaryFallback: boolean
  resolve: (c: Context<Env>, slug: string) => Promise<OgEntity | null>
}

function createOgHandler(adapters: readonly OgAdapter[]) {
  return async (c: Context<Env>) => {
    const slug = stripPng(c.req.param('filename'))
    if (!slug) {
      return ogFallback(c)
    }

    const { settings, localization } = c.var.requestContext
    const entities = await Promise.all(adapters.map((adapter) => adapter.resolve(c, slug)))
    const selectedIndex = entities.findIndex((entity) => entity !== null)
    const entity = entities[selectedIndex]
    const adapter = adapters[selectedIndex]
    if (!entity || !adapter) {
      return ogFallback(c)
    }

    const summary =
      entity.summary ||
      (adapter.useSiteSummaryFallback ? requireBlogSettingsSection('siteIdentity', settings).description : '')
    // The key carries the pinned settings generation AND the renderer gets the
    // same bundle, so the card's title/logo/SEO dimensions match the key.
    const buffer = await through(
      'og',
      {
        slug: `${adapter.cacheKeyPrefix}${slug}`,
        title: entity.title,
        summary,
        cover: entity.cover,
        settingsRevision: localization.revisions.og,
      },
      () => drawOpenGraph({ title: entity.title, summary, cover: entity.cover }, settings),
    )
    return respondPng(c, buffer, OG_HEADERS)
  }
}

const postOgAdapter: OgAdapter = {
  cacheKeyPrefix: '',
  useSiteSummaryFallback: false,
  async resolve(c, slug) {
    const post = findPublicPostMetaBySlug(c.var.requestContext.db, slug)
    return post && isLive(post) ? { title: post.title, summary: post.summary, cover: post.cover } : null
  },
}

const pageOgAdapter: OgAdapter = {
  cacheKeyPrefix: '',
  useSiteSummaryFallback: true,
  async resolve(c, slug) {
    const page = findPublicPageMetaBySlug(c.var.requestContext.db, slug)
    return page && isLive(page) ? { title: page.title, summary: page.summary, cover: page.cover } : null
  },
}

const categoryOgAdapter: OgAdapter = {
  cacheKeyPrefix: 'cat-',
  useSiteSummaryFallback: true,
  async resolve(c, slug) {
    const category = await findCategoryBySlug(c.var.requestContext.db, slug)
    return category ? { title: category.name, summary: category.description, cover: category.cover } : null
  },
}

const AVATAR_HEADERS = {
  'Cache-Control': 'public, max-age=604800',
}

const AVATAR_IP_RATE_BUCKET = { windowSeconds: 60, maxAttempts: 3000 }
const AVATAR_RATE_BUCKET = { windowSeconds: 1, maxAttempts: 5 }

// Hono footgun: `:name.png` captures the `.png` into the param — declare
// `{[^/]+\\.png}` regex constraints instead.
function stripPng(filename: string | undefined): string {
  return filename?.replace(/\.png$/, '') ?? ''
}

// Per-route limiter, never router-level `.use()` — mounted at `/`, a bare
// `.use()` would rate-limit every public SSR page view against the images bucket.
const imagesRateLimit = rateLimitByIp('images', 'resource')

export const imagesRouter = new Hono<Env>()
  .get('/images/og/:filename{[^/]+\\.png}', imagesRateLimit, createOgHandler([postOgAdapter, pageOgAdapter]))
  .get('/images/og/cats/:filename{[^/]+\\.png}', imagesRateLimit, createOgHandler([categoryOgAdapter]))
  .get('/images/calendar/:year/:filename{[^/]+\\.png}', imagesRateLimit, async (c) => {
    const { settings, localization } = c.var.requestContext
    return serveCalendar(
      { year: c.req.param('year'), time: stripPng(c.req.param('filename')) },
      {
        theme: 'light',
        locale: localization.locale,
        settingsRevision: localization.revisions.calendar,
        settings,
        ifNoneMatch: c.req.header('if-none-match') ?? null,
      },
    )
  })
  .get('/images/calendar/dark/:year/:filename{[^/]+\\.png}', imagesRateLimit, async (c) => {
    const { settings, localization } = c.var.requestContext
    return serveCalendar(
      { year: c.req.param('year'), time: stripPng(c.req.param('filename')) },
      {
        theme: 'dark',
        locale: localization.locale,
        settingsRevision: localization.revisions.calendar,
        settings,
        ifNoneMatch: c.req.header('if-none-match') ?? null,
      },
    )
  })
  .get(
    '/images/avatar/:filename{[^/]+\\.png}',
    rateLimitByIp('avatar-ip', AVATAR_IP_RATE_BUCKET),
    rateLimitByRequestKey('avatar', AVATAR_RATE_BUCKET, (c) => stripPng(c.req.param('filename')).toLowerCase()),
    async (c) => {
      const hash = stripPng(c.req.param('filename'))
      if (!hash) {
        return c.redirect(defaultAvatarUrl())
      }
      const size = resolveAvatarSize(c.req.query('s'))
      const avatar = await serveAvatar(c.var.requestContext.db, hash, size)
      if (avatar.kind === 'redirect') {
        return c.redirect(defaultAvatarUrl())
      }
      return respondPng(c, avatar.buffer, AVATAR_HEADERS)
    },
  )
