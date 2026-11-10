// Stable React Router identity for frontend RUM.
//
// The SDK must never receive `location.pathname`, `location.search`, route
// params, or content titles as a view name. The deepest matched route ID is
// app-authored and param-free; the URL passed to the SDK is derived by
// substituting the router's own params back with their segment placeholders.

export interface RumRouteMatch {
  id?: string
  pathname: string
  params?: Readonly<Record<string, string | undefined>>
}

export interface RumRouteContext {
  /** Deepest stable React Router route ID, e.g. `routes/public/post/detail`. */
  id: string
  /** Param-placeholder path, e.g. `/posts/:slug`. */
  template: string
}

const UNKNOWN_ROUTE: RumRouteContext = { id: 'unknown', template: '/unknown' }
const ROUTE_ID_PATTERN = /^[A-Za-z0-9_./:-]{1,160}$/
const STATIC_SEGMENT_PATTERN = /^[A-Za-z0-9._~-]{1,64}$/
const PARAM_SEGMENT_PATTERN = /^:[A-Za-z0-9_*]{1,32}$/

function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

function isSafeRouteId(value: string): boolean {
  return ROUTE_ID_PATTERN.test(value) && !value.includes('..')
}

function isSafeTemplate(value: string): boolean {
  if (value.length === 0 || value.length > 512 || value.includes('..')) {
    return false
  }
  if (value === '/') {
    return true
  }
  if (!value.startsWith('/')) {
    return false
  }
  return value
    .slice(1)
    .split('/')
    .every((segment) => STATIC_SEGMENT_PATTERN.test(segment) || PARAM_SEGMENT_PATTERN.test(segment))
}

/**
 * Derive the view identity from the matched chain. Params are used only as a
 * replacement map: a whole path segment equal to a param value becomes
 * `:<name>`, so the emitted template contains placeholders, never values.
 */
export function rumRouteContextFromMatches(matches: readonly RumRouteMatch[]): RumRouteContext {
  const match = matches[matches.length - 1]
  if (match === undefined) {
    return UNKNOWN_ROUTE
  }

  // Deepest params win: a layout param name may be shadowed by its child.
  const params = new Map<string, string>()
  for (let index = matches.length - 1; index >= 0; index -= 1) {
    for (const [key, value] of Object.entries(matches[index]?.params ?? {})) {
      if (typeof value === 'string' && value.length > 0 && !params.has(value)) {
        params.set(value, key)
      }
    }
  }

  const pathname = match.pathname
  const splat = readParam(match, '*')
  if (typeof pathname !== 'string' || pathname.length === 0 || !pathname.startsWith('/')) {
    return UNKNOWN_ROUTE
  }

  let template: string
  if (splat !== undefined && splat.length > 0) {
    const suffix = `/${splat}`
    const at = pathname.indexOf(suffix)
    template = at >= 0 ? `${pathname.slice(0, at)}/:*` : pathname
  } else {
    // Match from the RIGHT: a static segment may legitimately equal a param
    // value (e.g. `/admin/library/music/music` with `id=music`), and the
    // router's param segment is the later occurrence.
    const segments = pathname.split('/')
    const replaced = new Map<number, string>()
    const entries = [...params.entries()]
    for (let entryIndex = entries.length - 1; entryIndex >= 0; entryIndex -= 1) {
      const [value, key] = entries[entryIndex]!
      for (let index = segments.length - 1; index >= 0; index -= 1) {
        if (replaced.has(index)) {
          continue
        }
        const segment = segments[index]!
        if (segment.length > 0 && (segment === value || safeDecode(segment) === value)) {
          replaced.set(index, `:${key}`)
          break
        }
      }
    }
    template = segments.map((segment, index) => replaced.get(index) ?? segment).join('/')
  }

  const rawId = match.id
  const id = typeof rawId === 'string' && isSafeRouteId(rawId) ? rawId : UNKNOWN_ROUTE.id
  return {
    id,
    template: isSafeTemplate(template) ? template : UNKNOWN_ROUTE.template,
  }
}

function readParam(match: RumRouteMatch, key: string): string | undefined {
  const value = match.params?.[key]
  return typeof value === 'string' ? value : undefined
}
