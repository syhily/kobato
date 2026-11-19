const SELF_TELEMETRY_PATHS: ReadonlySet<string> = new Set([
  '/api/analytics/env',
  '/api/analytics/events',
  '/api/rum/status',
])
const DROPPED_PATH_PREFIXES = ['/rum/', '/api/rum/intake', '/health', '/ready'] as const

const STATIC_PATHS: ReadonlySet<string> = new Set([
  '/',
  '/archives',
  '/categories',
  '/feed',
  '/feed/atom',
  '/sitemap.xml',
  '/robots.txt',
  '/manifest.webmanifest',
  '/webmention',
  '/search',
  '/tags',
  '/admin',
  '/admin/posts',
  '/admin/pages',
  '/admin/comments',
  '/admin/webmentions',
  '/admin/tasks',
  '/admin/taxonomy/categories',
  '/admin/taxonomy/tags',
  '/admin/taxonomy/friends',
  '/admin/library/images',
  '/admin/library/music',
  '/admin/library/music/add',
  '/admin/library/branding',
  '/admin/library/fonts',
  '/admin/security/users',
  '/admin/security/sessions',
  '/admin/security/audit-log',
  '/admin/me/profile',
  '/admin/me/comments',
  '/admin/me/sessions',
  '/admin/analytics',
  '/admin/analytics/realtime',
  '/admin/analytics/mentions',
  '/admin/settings',
  '/admin/signin',
  '/admin/setup',
  '/editor/post/new',
  '/editor/page/new',
])

const DYNAMIC_PATH_FAMILIES: readonly (readonly [RegExp, string])[] = [
  [/^\/posts\/[^/]+$/, '/posts/:slug'],
  [/^\/page\/\d+$/, '/page/:num'],
  [/^\/cats\/[^/]+$/, '/cats/:slug'],
  [/^\/cats\/[^/]+\/page\/\d+$/, '/cats/:slug/page/:num'],
  [/^\/cats\/[^/]+\/feed(?:\/atom)?$/, '/cats/:slug/feed'],
  [/^\/tags\/[^/]+$/, '/tags/:slug'],
  [/^\/tags\/[^/]+\/page\/\d+$/, '/tags/:slug/page/:num'],
  [/^\/tags\/[^/]+\/feed(?:\/atom)?$/, '/tags/:slug/feed'],
  [/^\/search\/[^/]+$/, '/search/:keyword'],
  [/^\/search\/[^/]+\/page\/\d+$/, '/search/:keyword/page/:num'],
  [/^\/admin\/posts\/[^/]+\/analytics$/, '/admin/posts/:postId/analytics'],
  [/^\/admin\/library\/music\/[^/]+$/, '/admin/library/music/:id'],
  [/^\/admin\/security\/users\/[^/]+$/, '/admin/security/users/:id'],
  [/^\/admin\/.+$/, '/admin/:path'],
  [/^\/editor\/post\/[^/]+\/analytics$/, '/editor/post/:id/analytics'],
  [/^\/editor\/post\/[^/]+$/, '/editor/post/:id'],
  [/^\/editor\/page\/[^/]+$/, '/editor/page/:id'],
  [/^\/editor\/.+$/, '/editor/:path'],
  [/^\/api\/admin\/backup\/download\/[^/]+$/, '/api/admin/backup/download/:id'],
  [/^\/api\/.+$/, '/api/:endpoint'],
  [/^\/images\/.+$/, '/images/:asset'],
  [/^\/storage\/.+$/, '/storage/:key'],
  [/^\/fonts\/.+$/, '/fonts/:asset'],
  [/^\/fonts-package\/.+$/, '/fonts-package/:asset'],
  [/^\/music\/.+$/, '/music/:asset'],
]

const RPC_SEGMENT_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,63}$/
const RPC_MAX_SEGMENTS = 8

const DEV_VITE_ENTRY_PATHS: ReadonlySet<string> = new Set(['/@vite/client', '/@vite/env', '/@react-refresh'])
const DEV_SOURCE_MODULE_PATTERN =
  /^\/src\/(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+\.(?:ts|tsx|js|jsx|mjs|cjs|css|json|svg|png|jpe?g|webp|avif|gif|woff2?|ttf|otf|wasm)$/
const DEV_VITE_DEP_PATTERN = /^\/node_modules\/\.vite\/deps\/[A-Za-z0-9@._-]{1,160}\.js$/

function parseSameOriginRumUrl(rawUrl: string, origin: string): URL | null {
  if (!/^(?:https?:\/\/|\/)/.test(rawUrl)) {
    return null
  }
  let url: URL
  try {
    url = new URL(rawUrl, origin)
  } catch {
    return null
  }
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.origin !== origin) {
    return null
  }
  return url
}

export function isTelemetryExcludedRumUrl(rawUrl: string, origin: string): boolean {
  const url = parseSameOriginRumUrl(rawUrl, origin)
  if (url === null) {
    return false
  }
  return (
    SELF_TELEMETRY_PATHS.has(url.pathname) ||
    DROPPED_PATH_PREFIXES.some((prefix) => url.pathname === prefix || url.pathname.startsWith(prefix))
  )
}

export function isTraceableRumUrl(rawUrl: string, origin: string): boolean {
  return parseSameOriginRumUrl(rawUrl, origin) !== null && !isTelemetryExcludedRumUrl(rawUrl, origin)
}

export function isSelfTelemetryRumUrl(rawUrl: string, origin: string): boolean {
  return isTelemetryExcludedRumUrl(rawUrl, origin)
}

export function sanitizeResourceUrl(rawUrl: unknown, origin: string): string | null {
  if (typeof rawUrl !== 'string' || rawUrl.length === 0 || rawUrl.length > 2048) {
    return null
  }
  let url: URL
  try {
    url = new URL(rawUrl, origin)
  } catch {
    return null
  }
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.origin !== origin) {
    return null
  }
  if (url.username !== '' || url.password !== '') {
    return null
  }
  if (hasPathTraversal(rawUrl)) {
    return null
  }
  return classifyPath(url.pathname)
}

function hasPathTraversal(rawUrl: string): boolean {
  const withoutOrigin = rawUrl.replace(/^[A-Za-z][A-Za-z0-9+.-]*:\/\/[^/]*/, '')
  const path = withoutOrigin.split(/[?#]/, 1)[0] ?? ''
  return path.split('/').some((segment) => {
    if (segment.length === 0) {
      return false
    }
    let decoded = segment
    try {
      decoded = decodeURIComponent(segment)
    } catch {
      return true
    }
    return decoded === '.' || decoded === '..'
  })
}

function classifyRpcPath(pathname: string): string | null {
  if (!pathname.startsWith('/rpc/')) {
    return null
  }
  const raw = pathname.slice('/rpc/'.length)
  if (raw.length === 0 || raw.includes('%')) {
    return null
  }
  let segments: string[]
  if (raw.includes('/')) {
    if (raw.includes('.')) {
      return null
    }
    segments = raw.split('/')
  } else {
    segments = raw.split('.')
  }
  if (
    segments.length < 2 ||
    segments.length > RPC_MAX_SEGMENTS ||
    !segments.every((segment) => RPC_SEGMENT_PATTERN.test(segment))
  ) {
    return null
  }
  return `/rpc/${segments.join('.')}`
}

function classifyDevModulePath(pathname: string): string | null {
  if (DEV_VITE_ENTRY_PATHS.has(pathname)) {
    return pathname
  }
  if (pathname.includes('..')) {
    return null
  }
  if (DEV_VITE_DEP_PATTERN.test(pathname) || DEV_SOURCE_MODULE_PATTERN.test(pathname)) {
    return pathname
  }
  return null
}

function classifyPath(pathname: string): string | null {
  if (pathname.length === 0 || pathname.length > 1024) {
    return null
  }
  for (const prefix of DROPPED_PATH_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(prefix)) {
      return null
    }
  }
  if (SELF_TELEMETRY_PATHS.has(pathname)) {
    return null
  }
  if (pathname.endsWith('.data')) {
    const base = classifyPath(pathname.slice(0, -'.data'.length))
    return base === null ? null : `${base}.data`
  }
  if (pathname === '/') {
    return '/'
  }
  if (/^\/assets\/[A-Za-z0-9._-]{1,160}$/.test(pathname)) {
    return pathname
  }
  if (pathname === '/rpc' || pathname.startsWith('/rpc/')) {
    return classifyRpcPath(pathname)
  }
  const devModule = classifyDevModulePath(pathname)
  if (devModule !== null) {
    return devModule
  }
  if (STATIC_PATHS.has(pathname)) {
    return pathname
  }
  for (const [pattern, family] of DYNAMIC_PATH_FAMILIES) {
    if (pattern.test(pathname)) {
      return family
    }
  }
  if (/^\/[^/]{1,400}$/.test(pathname) && !pathname.startsWith('/_')) {
    let decoded = pathname.slice(1)
    try {
      decoded = decodeURIComponent(decoded)
    } catch {
      return null
    }
    if (/^[\p{L}\p{N}._~-]{1,200}$/u.test(decoded)) {
      return '/:slug'
    }
  }
  return null
}
