import { notFound } from '@kobato/shared/http/status'
import { pagePath } from '@kobato/shared/utils/paths'
import { redirect } from 'react-router'

// Raw `:num` URL param → integer. 404s when the segment isn't a numeric
// string (we never want `/page/abc` to silently match page 1). The regex
// guarantees `Number.parseInt` succeeds, so no follow-up NaN check is needed.
export function parsePageNum(raw: string | undefined): number {
  if (raw === undefined || raw === '' || !/^\d+$/.test(raw)) {
    notFound()
  }
  return Number.parseInt(raw, 10)
}

// Same as `parsePageNum` plus the canonical-collapse rule: `/page/1` redirects
// to the bare root (e.g. `/page/1` → `/`). Returns the parsed `pageNum` when
// the URL is the canonical one.
export function parseListingPage(raw: string | undefined, rootPath: string): number {
  const pageNum = raw === undefined ? 1 : parsePageNum(raw)
  if (raw !== undefined && pageNum <= 1) {
    throw redirect(rootPath)
  }
  return pageNum
}

// Bounds-check the requested page against the catalog's actual page count.
// Out-of-range pages redirect to the last valid page; an empty catalog 404s
// (we never serve a blank listing).
export function redirectListingOverflow(
  raw: string | undefined,
  pageNum: number,
  totalPage: number,
  rootPath: string,
  allowEmpty = false,
): void {
  if (raw !== undefined && pageNum > totalPage && totalPage > 0) {
    throw redirect(pagePath(rootPath, totalPage))
  }
  if (totalPage === 0 && !allowEmpty) {
    notFound()
  }
}
