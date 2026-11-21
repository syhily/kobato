import { requireBlogSettingsSection } from '@kobato/settings/getters'
import { joinUrl } from '@kobato/utils/urls'

export function searchRootPath(query: string): string {
  return `/search/${encodeURIComponent(query)}`
}

export function entityPermalink(type: 'post' | 'page', slug: string): string {
  return type === 'post' ? `/posts/${slug}` : `/${slug}`
}

export function entityCommentUrl(type: 'post' | 'page', slug: string): string {
  const website = requireBlogSettingsSection('siteIdentity').website
  return joinUrl(website, entityPermalink(type, slug), '/')
}

export function trimSiteSuffix(title: string | null): string {
  let trim = title ?? ''
  const siteIdentity = requireBlogSettingsSection('siteIdentity')
  const suffix = ` ${siteIdentity.titleSeparator} ${siteIdentity.title}`
  if (trim.includes(suffix)) {
    trim = trim.substring(0, trim.indexOf(suffix))
  }
  return trim
}

export function canonicalPostPath(requestedSlug: string | undefined, canonicalSlug: string): string | undefined {
  return requestedSlug !== undefined && requestedSlug !== canonicalSlug ? `/posts/${canonicalSlug}` : undefined
}

export function pagePath(rootPath: string, pageNum: number): string {
  if (pageNum <= 1) {
    return rootPath
  }
  const pageRoot = rootPath.endsWith('/') ? rootPath : `${rootPath}/`
  return `${pageRoot}page/${pageNum}`
}
