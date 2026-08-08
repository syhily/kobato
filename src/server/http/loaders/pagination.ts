import { redirect } from 'react-router'

import { notFound } from '@/server/infra/http/status'
import { pagePath } from '@/shared/utils/paths'

// 404s when the segment isn't numeric — `/page/abc` must not match page 1.
export function parsePageNum(raw: string | undefined): number {
  if (raw === undefined || raw === '' || !/^\d+$/.test(raw)) {
    notFound()
  }
  return Number.parseInt(raw, 10)
}

// Same plus the canonical-collapse rule: `/page/1` redirects to the bare root.
export function parseListingPage(raw: string | undefined, rootPath: string): number {
  const pageNum = raw === undefined ? 1 : parsePageNum(raw)
  if (raw !== undefined && pageNum <= 1) {
    throw redirect(rootPath)
  }
  return pageNum
}

// Bounds-check: out-of-range pages redirect to the last valid page; an empty catalog 404s.
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
