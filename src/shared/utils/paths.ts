// Canonical URL helpers shared by loaders, components, and tests. Pure
// string builders — no Response / redirect side effects so they're safe to
// import from both server and client modules.

import { requireBlogSettingsSection } from '@/shared/config/getters'
import { joinUrl } from '@/shared/utils/urls'

export function searchRootPath(query: string): string {
  return `/search/${encodeURIComponent(query)}`
}

/** Site-relative permalink of a post (`/posts/<slug>`) or page (`/<slug>`). */
export function entityPermalink(type: 'post' | 'page', slug: string): string {
  return type === 'post' ? `/posts/${slug}` : `/${slug}`
}

/**
 * Fully-qualified URL with trailing slash — the shape comment / metric
 * rows used to store as the URL `page_key`. Used at email-send time so
 * notification permalinks always reflect the current `siteIdentity.website`
 * and the current canonical slug.
 */
export function entityCommentUrl(type: 'post' | 'page', slug: string): string {
  const website = requireBlogSettingsSection('siteIdentity').website
  return joinUrl(website, entityPermalink(type, slug), '/')
}

/** Strip the ` - <site title>` suffix document titles carry. */
export function trimSiteSuffix(title: string | null): string {
  let trim = title ?? ''
  const siteTitle = requireBlogSettingsSection('siteIdentity').title
  if (trim.includes(` - ${siteTitle}`)) {
    trim = trim.substring(0, trim.indexOf(` - ${siteTitle}`))
  }
  return trim
}

// When a post is fetched via one of its aliases, return the canonical
// `/posts/<slug>` so the route can issue a 301 redirect. Returns `undefined`
// when the requested slug is already the canonical one (no redirect needed).
export function canonicalPostPath(requestedSlug: string | undefined, canonicalSlug: string): string | undefined {
  return requestedSlug !== undefined && requestedSlug !== canonicalSlug ? `/posts/${canonicalSlug}` : undefined
}

// Build the canonical URL for page `pageNum` under `rootPath`. Page 1 of a
// listing is the bare root URL (no `/page/1` suffix) for canonical collapse.
export function pagePath(rootPath: string, pageNum: number): string {
  if (pageNum <= 1) {
    return rootPath
  }
  const pageRoot = rootPath.endsWith('/') ? rootPath : `${rootPath}/`
  return `${pageRoot}page/${pageNum}`
}
