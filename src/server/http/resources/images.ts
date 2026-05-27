import type { Context } from 'hono'

import { Hono } from 'hono'
import crypto from 'node:crypto'

import type { Env } from '@/server/http/context'

import { findPageBySlug } from '@/server/domains/pages/repo'
import { findPostBySlug } from '@/server/domains/posts/repos/single'
import { tryResourceRateLimit } from '@/server/infra/rate-limit'
import { loadBuffer } from '@/server/infra/redis/buffer-cache'
import { AvatarStatus, cacheAvatar, loadAvatar } from '@/server/render/avatar/cache'
import {
  defaultAvatarUrl,
  fetchAvatarImage,
  fetchQQAvatarImage,
  isQQEmail,
  resolveAvatarInfo,
} from '@/server/render/avatar/fetch'
import { serveCalendar } from '@/server/render/calendar/serve'
import { drawOpenGraph } from '@/server/render/og/render'
import { getCacheSettings, requireBlogSettingsSection } from '@/shared/config/getters'
import { getClientAddress } from '@/shared/utils/request'
import { joinUrl } from '@/shared/utils/urls'

// ─── OG image ─────────────────────────────────────────────────────

function ogCacheKey(slug: string, title: string, summary: string, cover: string): string {
  const hash = crypto.createHash('sha1').update(`${title}\u0001${summary}\u0001${cover}`).digest('hex').slice(0, 16)
  return `${getCacheSettings().cache.og.prefix}${slug}-${hash}`
}

const OG_HEADERS: HeadersInit = {
  'Cache-Control': 'public, max-age=604800, immutable',
}

function ogFallback(c: Context<Env>) {
  return c.redirect(joinUrl(requireBlogSettingsSection('siteIdentity').website, '/images/open-graph.png'))
}

// ─── Avatar ───────────────────────────────────────────────────────

const AVATAR_HEADERS: HeadersInit = {
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

function stripPng(filename: string): string {
  return filename.replace(/\.png$/, '')
}

export const imagesRouter = new Hono<Env>()
  .use(async (c, next) => {
    const { exceeded } = await tryResourceRateLimit(getClientAddress(c.req.raw))
    if (exceeded) {
      return c.json({ error: 'Too many requests' }, 429)
    }
    await next()
  })
  .get('/images/og/:filename{[^/]+\\.png}', async (c) => {
    const slug = stripPng(c.req.param('filename'))
    if (!slug) {
      return ogFallback(c)
    }

    const ttl = getCacheSettings().cache.og.ttlSeconds
    const [post, page] = await Promise.all([findPostBySlug(c.var.db, slug), findPageBySlug(c.var.db, slug)])
    if (!post && !page) {
      return ogFallback(c)
    }

    if (post) {
      const buffer = await loadBuffer(
        ogCacheKey(slug, post.title, post.summary, post.cover),
        () => drawOpenGraph({ title: post.title, summary: post.summary, cover: post.cover }),
        ttl,
      )
      c.header('Content-Type', 'image/png')
      Object.entries(OG_HEADERS).forEach(([k, v]) => c.header(k, v))
      return c.body(new Uint8Array(buffer))
    }

    const summary = page!.summary || requireBlogSettingsSection('siteIdentity').description
    const buffer = await loadBuffer(
      ogCacheKey(slug, page!.title, summary, page!.cover),
      () => drawOpenGraph({ title: page!.title, summary, cover: page!.cover }),
      ttl,
    )
    c.header('Content-Type', 'image/png')
    Object.entries(OG_HEADERS).forEach(([k, v]) => c.header(k, v))
    return c.body(new Uint8Array(buffer))
  })
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
      c.header('Content-Type', 'image/png')
      Object.entries(AVATAR_HEADERS).forEach(([k, v]) => c.header(k, v))
      return c.body(new Uint8Array(buffer))
    }

    const avatar = await loadAvatar(canonical)
    if (avatar !== null) {
      if (avatar.status === AvatarStatus.NO_AVATAR) {
        return c.redirect(defaultAvatarUrl())
      }
      if (avatar.buffer !== null) {
        c.header('Content-Type', 'image/png')
        Object.entries(AVATAR_HEADERS).forEach(([k, v]) => c.header(k, v))
        return c.body(new Uint8Array(avatar.buffer))
      }
    }

    const buffer = await fetchAvatarImage(canonical)
    if (buffer === null) {
      await cacheAvatar({ email: canonical, status: AvatarStatus.NO_AVATAR })
      return c.redirect(defaultAvatarUrl())
    }

    await cacheAvatar({ email: canonical, status: AvatarStatus.HAVE_AVATAR, buffer })
    c.header('Content-Type', 'image/png')
    Object.entries(AVATAR_HEADERS).forEach(([k, v]) => c.header(k, v))
    return c.body(new Uint8Array(buffer))
  })
