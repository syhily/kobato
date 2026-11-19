import { pagePath } from '@kobato/server/domains/content/urls.ts'
import { notFound } from '@kobato/server/infra/http/status.ts'
import { redirect } from 'react-router'

export function parsePageNum(raw: string | undefined): number {
  if (raw === undefined || raw === '' || !/^\d+$/.test(raw)) {
    notFound()
  }
  return Number.parseInt(raw, 10)
}

export function parseListingPage(raw: string | undefined, rootPath: string): number {
  const pageNum = raw === undefined ? 1 : parsePageNum(raw)
  if (raw !== undefined && pageNum <= 1) {
    throw redirect(rootPath)
  }
  return pageNum
}

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
