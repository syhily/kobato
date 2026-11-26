import type { ResourceRedirect } from '@kobato/api/contracts/primitives'
import type {
  CalendarImageInput,
  CalendarImageOutput,
  OgImageInput,
  OgImageOutput,
} from '@kobato/api/contracts/public/images'
import type { HandlerContext } from '@kobato/server/http/orpc-base'

import { imagesContract } from '@kobato/api/rpc/public/images'
import { APP_VERSION } from '@kobato/distribution/app'
import { isLive } from '@kobato/server/domains/content/schemas/live-gate'
import { resolveImageRef } from '@kobato/server/domains/images/services/resolve'
import { findPublicPageMetaBySlug } from '@kobato/server/domains/pages/services/public-query'
import { findPublicPostMetaBySlug } from '@kobato/server/domains/posts/services/single'
import { findCategoryBySlug } from '@kobato/server/domains/taxonomies/categories/services/query'
import { contentNotFound } from '@kobato/server/http/content-not-found'
import { implementPublic, rateLimitByIp, resourceRateLimit } from '@kobato/server/http/orpc-base'
import { through } from '@kobato/server/infra/cache/registry'
import { contentEtag, etagHeaderMatches } from '@kobato/server/infra/http/etag'
import { renderCalendar } from '@kobato/server/render/calendar/render'
import '@kobato/server/render/warmup/content-cache'
import { drawOpenGraph } from '@kobato/server/render/og/render'
import { requireBlogSettingsSection } from '@kobato/settings/getters'
import { brandingVersionSuffix } from '@kobato/settings/presentation'
import { joinUrl } from '@kobato/utils/urls'
import { isValid, parse, format } from 'date-fns'

const impl = implementPublic(imagesContract)

const OG_CACHE_CONTROL = 'public, max-age=3600'
const CALENDAR_CACHE_CONTROL = 'public, no-cache'
const CALENDAR_CONTENT_TYPE = 'image/png'

const CALENDAR_TIME_REGEX = /^\d{4}$/
const MIN_CALENDAR_YEAR = 1970
const MAX_CALENDAR_YEAR = 2100

interface OgEntity {
  title: string
  summary: string
  cover: string
}

interface OgAdapter {
  cacheKeyPrefix: string
  useSiteSummaryFallback: boolean
  resolve: (db: HandlerContext['db'], slug: string) => Promise<OgEntity | null>
}

function ogFallback(context: HandlerContext): ResourceRedirect {
  const suffix = brandingVersionSuffix(context.settings?.assets?.branding?.openGraph)
  return {
    kind: 'redirect',
    location: joinUrl(
      requireBlogSettingsSection('siteIdentity', context.settings).website,
      `/images/open-graph.png${suffix}`,
    ),
    cacheControl: null,
  }
}

async function ogAnswer(input: OgImageInput, context: HandlerContext): Promise<OgImageOutput> {
  const { settings, localization, db } = context
  const adapters = input.category === true ? [categoryOgAdapter] : [postOgAdapter, pageOgAdapter]
  const entities = await Promise.all(adapters.map((adapter) => adapter.resolve(db, input.slug)))
  const selectedIndex = entities.findIndex((entity) => entity !== null)
  const entity = entities[selectedIndex]
  const adapter = adapters[selectedIndex]
  if (!entity || !adapter) {
    return ogFallback(context)
  }

  const summary =
    entity.summary ||
    (adapter.useSiteSummaryFallback ? requireBlogSettingsSection('siteIdentity', settings).description : '')
  const buffer = await through(
    'og',
    {
      slug: `${adapter.cacheKeyPrefix}${input.slug}`,
      title: entity.title,
      summary,
      cover: entity.cover,
      settingsRevision: localization.revisions.og,
    },
    () => drawOpenGraph({ title: entity.title, summary, cover: entity.cover }, settings),
  )
  return {
    kind: 'ok',
    body: new Blob([new Uint8Array(buffer)], { type: 'image/png' }),
    contentType: 'image/png',
    cacheControl: OG_CACHE_CONTROL,
    contentLanguage: null,
  }
}

const postOgAdapter: OgAdapter = {
  cacheKeyPrefix: '',
  useSiteSummaryFallback: false,
  async resolve(db, slug) {
    const post = findPublicPostMetaBySlug(db, slug)
    return post && isLive(post) ? { title: post.title, summary: post.summary, cover: post.cover } : null
  },
}

const pageOgAdapter: OgAdapter = {
  cacheKeyPrefix: '',
  useSiteSummaryFallback: true,
  async resolve(db, slug) {
    const page = findPublicPageMetaBySlug(db, slug)
    return page && isLive(page) ? { title: page.title, summary: page.summary, cover: page.cover } : null
  },
}

const categoryOgAdapter: OgAdapter = {
  cacheKeyPrefix: 'cat-',
  useSiteSummaryFallback: true,
  async resolve(db, slug) {
    const category = await findCategoryBySlug(db, slug)
    return category ? { title: category.name, summary: category.description, cover: category.cover } : null
  },
}

async function calendarAnswer(input: CalendarImageInput, context: HandlerContext): Promise<CalendarImageOutput> {
  const { year, time, theme } = input
  if (!CALENDAR_TIME_REGEX.test(year) || !CALENDAR_TIME_REGEX.test(time)) {
    contentNotFound()
  }
  const yearNum = Number(year)
  if (yearNum < MIN_CALENDAR_YEAR || yearNum > MAX_CALENDAR_YEAR) {
    contentNotFound()
  }
  const rawDate = `${year}-${time}`
  const date = parse(rawDate, 'yyyy-MMdd', new Date())
  if (!isValid(date) || format(date, 'yyyy-MMdd') !== rawDate) {
    contentNotFound()
  }

  const { settings, localization } = context
  const buffer = await through(
    'calendar',
    {
      date: format(date, 'yyyy-MM-dd'),
      theme,
      locale: localization.locale,
      version: APP_VERSION,
      settingsRevision: localization.revisions.calendar,
    },
    () => renderCalendar(date, theme, localization.locale, settings),
  )
  const etag = contentEtag(buffer)
  if (etagHeaderMatches(input.ifNoneMatch, etag)) {
    return {
      kind: 'not-modified',
      etag,
      contentType: CALENDAR_CONTENT_TYPE,
      cacheControl: CALENDAR_CACHE_CONTROL,
      contentLanguage: localization.locale,
    }
  }
  return {
    kind: 'ok',
    body: new Blob([new Uint8Array(buffer)], { type: CALENDAR_CONTENT_TYPE }),
    etag,
    contentType: CALENDAR_CONTENT_TYPE,
    cacheControl: CALENDAR_CACHE_CONTROL,
    contentLanguage: localization.locale,
  }
}

const imagesRateLimit = rateLimitByIp('images', 'resource')

const resolveThumbhash = impl.resolveThumbhash.use(resourceRateLimit).handler(async ({ input, context }) => {
  const image = await resolveImageRef(context.db, input.src)
  return {
    thumbhash: image?.thumbhash ?? null,
    width: image?.width ?? null,
    height: image?.height ?? null,
  }
})

const og = impl.og.use(imagesRateLimit).handler(async ({ input, context }) => ogAnswer(input, context))

const calendar = impl.calendar
  .use(imagesRateLimit)
  .handler(async ({ input, context }) => calendarAnswer(input, context))

export const imageRouter = impl.router({
  resolveThumbhash,
  og,
  calendar,
})
