import type { Context } from 'hono'

import { Hono } from 'hono'

import type { Env } from '@/server/http/context'

import { defaultAvatarUrl, resolveAvatarSize, serveAvatar } from '@/server/domains/comments/services/avatar'
import { isLive } from '@/server/domains/content/schemas/live-gate'
import { findPublicPageMetaBySlug } from '@/server/domains/pages/services/public-query'
import { findPublicPostMetaBySlug } from '@/server/domains/posts/services/single'
import { findCategoryBySlug } from '@/server/domains/taxonomies/categories/services/query'
import { rateLimitByIp, rateLimitByRequestKey } from '@/server/http/middlewares/rate-limit'
import { serveCalendar } from '@/server/http/resources/calendar'
import { through } from '@/server/infra/cache/registry'
import { drawOpenGraph } from '@/server/render/og/render'
// Side-effect: wires render-layer warmup into the content domain's slot
// (this module owns the OG/calendar request path it mirrors).
import '@/server/render/warmup/content-cache'
import { requireBlogSettingsSection } from '@/shared/config/getters'
import { brandingVersionSuffix } from '@/shared/config/utils'
import { joinUrl } from '@/shared/utils/urls'

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

    const { db, settings, localization } = c.var.requestContext
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
      db,
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
// `{[^/]+\\.png}` regex constraints instead (a former avatar regression).
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
    const { db, settings, localization } = c.var.requestContext
    return serveCalendar(
      db,
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
    const { db, settings, localization } = c.var.requestContext
    return serveCalendar(
      db,
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
      // The domain service owns the serving policy; the resource only maps the outcome.
      const avatar = await serveAvatar(c.var.requestContext.db, hash, size)
      if (avatar.kind === 'redirect') {
        return c.redirect(defaultAvatarUrl())
      }
      return respondPng(c, avatar.buffer, AVATAR_HEADERS)
    },
  )
