import type { Context } from 'hono'

import { Hono } from 'hono'

import type { Env } from '@/server/http/context'

import {
  defaultAvatarUrl,
  fetchAvatarImage,
  fetchQQAvatarImage,
  isQQEmail,
  resolveAvatarInfo,
  resolveAvatarSize,
} from '@/server/domains/comments/services/avatar'
import { isLive } from '@/server/domains/content/schemas/live-gate'
import { findPublicPageMetaBySlug } from '@/server/domains/pages/services/public-query'
import { findPublicPostMetaBySlug } from '@/server/domains/posts/services/single'
import { findCategoryBySlug } from '@/server/domains/taxonomies/categories/services/query'
import { rateLimitByIp } from '@/server/http/middlewares/rate-limit'
import { serveCalendar } from '@/server/http/resources/calendar'
import { type AvatarEntry, AvatarStatus, get, set, through } from '@/server/infra/cache/registry'
import { drawOpenGraph } from '@/server/render/og/render'
import { requireBlogSettingsSection } from '@/shared/config/getters'
import { joinUrl } from '@/shared/utils/urls'

// ─── OG image ─────────────────────────────────────────────────────

const OG_HEADERS = {
  'Cache-Control': 'public, max-age=604800, immutable',
}

function respondPng(c: Context<Env>, buffer: Uint8Array, headers: Readonly<Record<string, string>>) {
  c.header('Content-Type', 'image/png')
  Object.entries(headers).forEach(([key, value]) => c.header(key, value))
  return c.body(new Uint8Array(buffer))
}

function ogFallback(c: Context<Env>) {
  return c.redirect(joinUrl(requireBlogSettingsSection('siteIdentity').website, '/images/open-graph.png'))
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

    const entities = await Promise.all(adapters.map((adapter) => adapter.resolve(c, slug)))
    const selectedIndex = entities.findIndex((entity) => entity !== null)
    const entity = entities[selectedIndex]
    const adapter = adapters[selectedIndex]
    if (!entity || !adapter) {
      return ogFallback(c)
    }

    const summary =
      entity.summary || (adapter.useSiteSummaryFallback ? requireBlogSettingsSection('siteIdentity').description : '')
    const buffer = await through(
      c.var.requestContext.db,
      'og',
      { slug: `${adapter.cacheKeyPrefix}${slug}`, title: entity.title, summary, cover: entity.cover },
      () => drawOpenGraph({ title: entity.title, summary, cover: entity.cover }),
    )
    return respondPng(c, buffer, OG_HEADERS)
  }
}

const postOgAdapter: OgAdapter = {
  cacheKeyPrefix: '',
  useSiteSummaryFallback: false,
  async resolve(c, slug) {
    const post = await findPublicPostMetaBySlug(c.var.requestContext.db, slug)
    return post && isLive(post) ? { title: post.title, summary: post.summary, cover: post.cover } : null
  },
}

const pageOgAdapter: OgAdapter = {
  cacheKeyPrefix: '',
  useSiteSummaryFallback: true,
  async resolve(c, slug) {
    const page = await findPublicPageMetaBySlug(c.var.requestContext.db, slug)
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

// ─── Avatar ───────────────────────────────────────────────────────

const AVATAR_HEADERS = {
  'Cache-Control': 'public, max-age=604800',
}

// ─── Router ───────────────────────────────────────────────────────
//
// Hono's path parser footgun: in a pattern like `/foo/:name.png`,
// `.png` is NOT a literal suffix — the `:` capture group greedily
// includes the `.` and the resulting param name becomes `name.png`
// (try `c.req.param()` on such a route). We therefore declare each
// image endpoint with an explicit `{[^/]+\\.png}` regex constraint
// on a `:filename` param and strip the extension in the handler.
// This was the cause of the "all avatars degrade to default"
// regression — every request was hitting `param('hash')` →
// `undefined` → fallback redirect.

function stripPng(filename: string | undefined): string {
  return filename?.replace(/\.png$/, '') ?? ''
}

export const imagesRouter = new Hono<Env>()
  .use(rateLimitByIp('images', 'resourceIp', { errorBody: { error: 'Too many requests' } }))
  .get('/images/og/:filename{[^/]+\\.png}', createOgHandler([postOgAdapter, pageOgAdapter]))
  .get('/images/og/cats/:filename{[^/]+\\.png}', createOgHandler([categoryOgAdapter]))
  .get('/images/calendar/:year/:filename{[^/]+\\.png}', async (c) => {
    const params = { year: c.req.param('year'), time: stripPng(c.req.param('filename')) }
    const headers = { 'Cache-Control': 'public, max-age=86400' }
    const res = await serveCalendar(c.var.requestContext.db, params, 'light', headers)
    res.headers.forEach((v, k) => c.header(k, v))
    return c.body(await res.arrayBuffer())
  })
  .get('/images/calendar/dark/:year/:filename{[^/]+\\.png}', async (c) => {
    const params = { year: c.req.param('year'), time: stripPng(c.req.param('filename')) }
    const headers = { 'Cache-Control': 'public, max-age=86400' }
    const res = await serveCalendar(c.var.requestContext.db, params, 'dark', headers)
    res.headers.forEach((v, k) => c.header(k, v))
    return c.body(await res.arrayBuffer())
  })
  .get('/images/avatar/:filename{[^/]+\\.png}', async (c) => {
    const hash = stripPng(c.req.param('filename'))
    if (!hash) {
      return c.redirect(defaultAvatarUrl())
    }
    const size = resolveAvatarSize(c.req.query('s'))

    const { email, hash: canonical } = await resolveAvatarInfo(c.var.requestContext.db, hash)
    if (canonical === null) {
      await set(
        c.var.requestContext.db,
        'avatar',
        { size, email: hash },
        { status: AvatarStatus.NO_AVATAR, buffer: null },
      )
      return c.redirect(defaultAvatarUrl())
    }

    if (email && isQQEmail(email)) {
      const buffer = await fetchQQAvatarImage(email, size)
      if (buffer === null) {
        await set(
          c.var.requestContext.db,
          'avatar',
          { size, email: canonical },
          { status: AvatarStatus.NO_AVATAR, buffer: null },
        )
        return c.redirect(defaultAvatarUrl())
      }
      await set(
        c.var.requestContext.db,
        'avatar',
        { size, email: canonical },
        { status: AvatarStatus.HAVE_AVATAR, buffer },
      )
      return respondPng(c, buffer, AVATAR_HEADERS)
    }

    // Concurrent reads of the same email coalesce inside the cache module,
    // so a hot avatar (e.g. the site owner appearing in every comment
    // thread) only round-trips kv_cache once per concurrent burst instead
    // of once per requesting comment.
    const avatar = await get<'avatar', AvatarEntry>(c.var.requestContext.db, 'avatar', { size, email: canonical })
    if (avatar !== null) {
      if (avatar.status === AvatarStatus.NO_AVATAR) {
        return c.redirect(defaultAvatarUrl())
      }
      if (avatar.buffer !== null) {
        return respondPng(c, avatar.buffer, AVATAR_HEADERS)
      }
    }

    const buffer = await fetchAvatarImage(canonical, size)
    if (buffer === null) {
      await set(
        c.var.requestContext.db,
        'avatar',
        { size, email: canonical },
        { status: AvatarStatus.NO_AVATAR, buffer: null },
      )
      return c.redirect(defaultAvatarUrl())
    }

    await set(
      c.var.requestContext.db,
      'avatar',
      { size, email: canonical },
      { status: AvatarStatus.HAVE_AVATAR, buffer },
    )
    return respondPng(c, buffer, AVATAR_HEADERS)
  })
