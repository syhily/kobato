import type { Context } from 'hono'

import { Hono } from 'hono'
import crypto from 'node:crypto'

import type { Env } from '@/server/http/context'

import {
  defaultAvatarUrl,
  fetchAvatarImage,
  fetchQQAvatarImage,
  isQQEmail,
  resolveAvatarInfo,
} from '@/server/domains/comments/services/avatar'
import { isLive } from '@/server/domains/content/schema'
import { findPublicPageMetaBySlug } from '@/server/domains/pages/repo'
import { findPublicPostMetaBySlug } from '@/server/domains/posts/repos/single'
import { rateLimitByIp } from '@/server/http/middlewares/rate-limit'
import { AvatarStatus, cacheAvatar, loadAvatar } from '@/server/http/resources/avatar-cache'
import { serveCalendar } from '@/server/http/resources/calendar'
import { findCategoryBySlug } from '@/server/infra/db/operations/category'
import { loadBuffer } from '@/server/infra/redis/buffer-cache'
import { drawOpenGraph } from '@/server/render/og/render'
import { getCacheSettings, requireBlogSettingsSection } from '@/shared/config/getters'
import { joinUrl } from '@/shared/utils/urls'

// ─── OG image ─────────────────────────────────────────────────────

function ogCacheKey(slug: string, title: string, summary: string, cover: string): string {
  const hash = crypto.createHash('sha1').update(`${title}\u0001${summary}\u0001${cover}`).digest('hex').slice(0, 16)
  return `${getCacheSettings().cache.og.prefix}${slug}-${hash}`
}

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

    const ttl = getCacheSettings().cache.og.ttlSeconds
    const entities = await Promise.all(adapters.map((adapter) => adapter.resolve(c, slug)))
    const selectedIndex = entities.findIndex((entity) => entity !== null)
    const entity = entities[selectedIndex]
    const adapter = adapters[selectedIndex]
    if (!entity || !adapter) {
      return ogFallback(c)
    }

    const summary =
      entity.summary || (adapter.useSiteSummaryFallback ? requireBlogSettingsSection('siteIdentity').description : '')
    const buffer = await loadBuffer(
      ogCacheKey(`${adapter.cacheKeyPrefix}${slug}`, entity.title, summary, entity.cover),
      () => drawOpenGraph({ title: entity.title, summary, cover: entity.cover }),
      ttl,
    )
    return respondPng(c, buffer, OG_HEADERS)
  }
}

const postOgAdapter: OgAdapter = {
  cacheKeyPrefix: '',
  useSiteSummaryFallback: false,
  async resolve(c, slug) {
    const post = await findPublicPostMetaBySlug(c.var.db, slug)
    return post && isLive(post) ? { title: post.title, summary: post.summary, cover: post.cover } : null
  },
}

const pageOgAdapter: OgAdapter = {
  cacheKeyPrefix: '',
  useSiteSummaryFallback: true,
  async resolve(c, slug) {
    const page = await findPublicPageMetaBySlug(c.var.db, slug)
    return page && isLive(page) ? { title: page.title, summary: page.summary, cover: page.cover } : null
  },
}

const categoryOgAdapter: OgAdapter = {
  cacheKeyPrefix: 'cat-',
  useSiteSummaryFallback: true,
  async resolve(c, slug) {
    const category = await findCategoryBySlug(c.var.db, slug)
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
    const res = await serveCalendar(params, 'light', headers)
    res.headers.forEach((v, k) => c.header(k, v))
    return c.body(await res.arrayBuffer())
  })
  .get('/images/calendar/dark/:year/:filename{[^/]+\\.png}', async (c) => {
    const params = { year: c.req.param('year'), time: stripPng(c.req.param('filename')) }
    const headers = { 'Cache-Control': 'public, max-age=86400' }
    const res = await serveCalendar(params, 'dark', headers)
    res.headers.forEach((v, k) => c.header(k, v))
    return c.body(await res.arrayBuffer())
  })
  .get('/images/avatar/:filename{[^/]+\\.png}', async (c) => {
    const hash = stripPng(c.req.param('filename'))
    if (!hash) {
      return c.redirect(defaultAvatarUrl())
    }

    const { email, hash: canonical } = await resolveAvatarInfo(c.var.db, hash)
    if (canonical === null) {
      await cacheAvatar({ email: hash, status: AvatarStatus.NO_AVATAR })
      return c.redirect(defaultAvatarUrl())
    }

    if (email && isQQEmail(email)) {
      const buffer = await fetchQQAvatarImage(email)
      if (buffer === null) {
        await cacheAvatar({ email: canonical, status: AvatarStatus.NO_AVATAR })
        return c.redirect(defaultAvatarUrl())
      }
      await cacheAvatar({ email: canonical, status: AvatarStatus.HAVE_AVATAR, buffer })
      return respondPng(c, buffer, AVATAR_HEADERS)
    }

    const avatar = await loadAvatar(canonical)
    if (avatar !== null) {
      if (avatar.status === AvatarStatus.NO_AVATAR) {
        return c.redirect(defaultAvatarUrl())
      }
      if (avatar.buffer !== null) {
        return respondPng(c, avatar.buffer, AVATAR_HEADERS)
      }
    }

    const buffer = await fetchAvatarImage(canonical)
    if (buffer === null) {
      await cacheAvatar({ email: canonical, status: AvatarStatus.NO_AVATAR })
      return c.redirect(defaultAvatarUrl())
    }

    await cacheAvatar({ email: canonical, status: AvatarStatus.HAVE_AVATAR, buffer })
    return respondPng(c, buffer, AVATAR_HEADERS)
  })
