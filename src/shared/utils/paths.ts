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
 * Fully-qualified URL with trailing slash — the shape stored as
 * `page_key`. Used at email-send time so permalinks reflect the current
 * website + canonical slug.
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

// Non-canonical requested slug → canonical `/posts/<slug>` for a 301;
// `undefined` when the requested slug is already canonical.
export function canonicalPostPath(requestedSlug: string | undefined, canonicalSlug: string): string | undefined {
  return requestedSlug !== undefined && requestedSlug !== canonicalSlug ? `/posts/${canonicalSlug}` : undefined
}

// Page 1 of a listing is the bare root URL (no `/page/1` suffix) for canonical collapse.
export function pagePath(rootPath: string, pageNum: number): string {
  if (pageNum <= 1) {
    return rootPath
  }
  const pageRoot = rootPath.endsWith('/') ? rootPath : `${rootPath}/`
  return `${pageRoot}page/${pageNum}`
}
