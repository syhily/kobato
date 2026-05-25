// Date formatter primitives shared between SSR and the client bundle.
//
// The `Intl.DateTimeFormat` instance can no longer be cached at module
// scope because the locale / time zone come from the runtime DB-backed
// blog config — the value an admin picks in `/admin/settings/general`
// must take effect on the next render without restarting the server.
//
// Callers thread the relevant slice of the config in explicitly:
//
// ```ts
// // SSR / server callers
// import { requireBlogSettingsSection } from '@/shared/config/getters'
// formatLocalDate(post.date, undefined, requireBlogSettingsSection('siteIdentity'))
// // UI components
// const siteIdentity = useSiteIdentity()
// formatShowDate(post.date, siteIdentity, loaderListingNowIso?)
// ```
//
// Either a `SiteIdentitySettings` (flat — only `locale` / `timeZone` /
// `timeFormat` are read) or a legacy aggregated wrapper
// (`{ settings: { locale, timeZone, timeFormat } }`) is accepted. The
// flat shape is preferred for new code so the caller pulls only the
// section it actually needs; the wrapped shape is kept around so the
// formatter test fixtures don't have to be reshaped.

export type FormatterLocale =
  | { locale: string; timeZone: string; timeFormat: string }
  | { settings: { locale: string; timeZone: string; timeFormat: string } }

function pickLocale(config: FormatterLocale): {
  locale: string
  timeZone: string
  timeFormat: string
} {
  if ('settings' in config) {
    return config.settings
  }
  return config
}

interface LocalDateParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
}

function makeFormatter(locale: string, timeZone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
}

// Tiny LRU keyed by `${locale}|${timeZone}` so repeated formatter calls
// for the same deployment do not pay the `Intl.DateTimeFormat` ctor
// cost on every invocation. The cap is generous enough for any real
// deployment; admin-side experimentation that flips locales rapidly is
// the only realistic source of churn.
const formatterCache = new Map<string, Intl.DateTimeFormat>()
const FORMATTER_CACHE_MAX = 8

function cachedFormatter(locale: string, timeZone: string): Intl.DateTimeFormat {
  const key = `${locale}|${timeZone}`
  const existing = formatterCache.get(key)
  if (existing !== undefined) {
    return existing
  }

  const formatter = makeFormatter(locale, timeZone)
  if (formatterCache.size >= FORMATTER_CACHE_MAX) {
    const oldest = formatterCache.keys().next().value
    if (oldest !== undefined) {
      formatterCache.delete(oldest)
    }
  }
  formatterCache.set(key, formatter)
  return formatter
}

function localDateParts(source: Date, locale: string, timeZone: string): LocalDateParts {
  const formatter = cachedFormatter(locale, timeZone)
  const parts = Object.fromEntries(
    formatter
      .formatToParts(source)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  )
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
  }
}

function dayNumber(parts: Pick<LocalDateParts, 'year' | 'month' | 'day'>): number {
  return Math.floor(Date.UTC(parts.year, parts.month - 1, parts.day) / 86_400_000)
}

function weekStartDay(parts: Pick<LocalDateParts, 'year' | 'month' | 'day'>): number {
  const day = dayNumber(parts)
  const weekday = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay()
  return day - ((weekday + 6) % 7)
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

export interface SlicePostsOptions {
  // Optional tail-merge guard. When set to a positive integer M and the
  // natural last page would render fewer than M posts, that last page is
  // merged into its predecessor i.e. the predecessor absorbs the orphan
  // posts via the existing "the last page is open-ended" branch below.
  // The result is a smaller totalPage and a fatter last page; the route
  // helper then 301-redirects any out-of-range :num back to the new
  // last page through the shared overflow handler. Defaults to 0
  // disabled, which is the historical behaviour every listing route
  // except home opts into. Home uses pageSize - 2 so a tail of one or
  // two orphaned posts collapses, but a near-full tail e.g. 8 of 10
  // keeps its own page.
  mergeTailWhenLessThan?: number
}

export function slicePosts<Type>(
  posts: Type[],
  pageNum: number,
  pageSize: number,
  options: SlicePostsOptions = {},
): { currentPosts: Type[]; totalPage: number } {
  const naturalTotalPage = Math.ceil(posts.length / pageSize)
  const totalPage = applyTailMerge(posts.length, pageSize, naturalTotalPage, options.mergeTailWhenLessThan ?? 0)

  if (totalPage === 0 || pageNum > totalPage) {
    return { currentPosts: [], totalPage }
  }

  return {
    currentPosts:
      pageNum === totalPage
        ? posts.slice((pageNum - 1) * pageSize)
        : posts.slice((pageNum - 1) * pageSize, pageNum * pageSize),
    totalPage,
  }
}

// Returns the post-merge totalPage. When `threshold` is 0 or the natural
// last page is already large enough, the natural totalPage is returned
// unchanged. The merge is only valid when there are at least two pages
// to begin with totalPage >= 2; a single-page listing has nothing to
// merge into. The single-page guard also protects callers from a
// near-empty catalog where the entire listing would otherwise be hidden.
function applyTailMerge(postCount: number, pageSize: number, naturalTotalPage: number, threshold: number): number {
  if (threshold <= 0 || naturalTotalPage < 2) {
    return naturalTotalPage
  }
  const tailSize = postCount - (naturalTotalPage - 1) * pageSize
  if (tailSize < threshold) {
    return naturalTotalPage - 1
  }
  return naturalTotalPage
}

/** `now` defaults to the runtime clock; pass an ISO string from the route loader so SSR and hydration agree. */
export function formatShowDate(date: Date, config: FormatterLocale, now?: Date | string) {
  const { locale, timeZone } = pickLocale(config)
  const source = localDateParts(date, locale, timeZone)
  const nowInstant = now === undefined ? new Date() : new Date(now)
  const nowParts = localDateParts(nowInstant, locale, timeZone)
  const deltaDays = dayNumber(nowParts) - dayNumber(source)

  if (deltaDays < 1) {
    return '今天'
  } else if (deltaDays < 2) {
    return '昨天'
  } else if (deltaDays < 7) {
    return `${deltaDays} 天前`
  } else if (deltaDays < 30) {
    return `${Math.floor((weekStartDay(nowParts) - weekStartDay(source)) / 7)} 周前`
  } else if (deltaDays < 210) {
    const months = (nowParts.year - source.year) * 12 + nowParts.month - source.month
    return `${months} 月前`
  } else {
    return formatLocalDate(date, undefined, config)
  }
}

export function formatLocalDate(source: string | Date, format: string | undefined, config: FormatterLocale): string {
  const { locale, timeZone, timeFormat } = pickLocale(config)
  const date = new Date(source)
  const parts = localDateParts(date, locale, timeZone)
  return (format || timeFormat)
    .replaceAll('yyyy', String(parts.year))
    .replaceAll('LL', pad(parts.month))
    .replaceAll('MM', pad(parts.month))
    .replaceAll('dd', pad(parts.day))
    .replaceAll('HH', pad(parts.hour))
    .replaceAll('mm', pad(parts.minute))
}
