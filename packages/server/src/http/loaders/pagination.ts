import type { ContentRedirectSignal } from '@kobato/api/contracts/public/content'

import { pagePath } from '@kobato/server/domains/content/urls'
import { contentNotFound } from '@kobato/server/http/content-not-found'

export function parsePageNum(raw: string | undefined): number {
  if (raw === undefined || raw === '' || !/^\d+$/.test(raw)) {
    contentNotFound()
  }
  return Number.parseInt(raw, 10)
}

export function parseListingPage(raw: string | undefined, rootPath: string): number | ContentRedirectSignal {
  const pageNum = raw === undefined ? 1 : parsePageNum(raw)
  if (raw !== undefined && pageNum <= 1) {
    return { kind: 'redirect', to: rootPath, status: 302 }
  }
  return pageNum
}

export function listingOverflowSignal(
  raw: string | undefined,
  pageNum: number,
  totalPage: number,
  rootPath: string,
  allowEmpty = false,
): ContentRedirectSignal | null {
  if (raw !== undefined && pageNum > totalPage && totalPage > 0) {
    return { kind: 'redirect', to: pagePath(rootPath, totalPage), status: 302 }
  }
  if (totalPage === 0 && !allowEmpty) {
    contentNotFound()
  }
  return null
}
