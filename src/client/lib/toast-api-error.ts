import { toast } from 'sonner'

import { extractApiErrorMessage } from '@/shared/utils/api-error'

/**
 * Uniform error toast for API/mutation failures: the caller owns the title; the server
 * copy rides in the description (`{ error: { message } }` wire bodies first, then the
 * ORPCError/Error message, then a bare string). In client/lib (not ui/lib) so client
 * hooks can use it without breaking the boundaries contract.
 *
 * An ORPCError whose `data` is a zod-style issue list (`[{ message, path }]`,
 * e.g. a rejected settings section save) gets the issues appended to the
 * description — otherwise the user sees a bare "设置数据无效" with no clue
 * WHICH field failed or why.
 */
export function toastApiError(err: unknown, title: string): void {
  const description = apiErrorDescription(err)
  if (description === undefined) {
    toast.error(title)
  } else {
    toast.error(title, { description })
  }
}

/**
 * Mutation `onError` shorthand for the toast-only failure path:
 * `onError: onMutationError('保存失败')`.
 */
export function onMutationError(title: string): (error: unknown) => void {
  return (error) => toastApiError(error, title)
}

function apiErrorDescription(err: unknown): string | undefined {
  const wireMessage = extractApiErrorMessage(err)
  const base =
    wireMessage ??
    (err instanceof Error && err.message !== '' ? err.message : typeof err === 'string' && err !== '' ? err : undefined)
  const issues = formatIssueList(err)
  if (base !== undefined && issues !== undefined) {
    return `${base}：${issues}`
  }
  return base ?? issues
}

interface IssueLike {
  message: string
  path?: PropertyKey[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value)
}

function isIssueLike(value: unknown): value is IssueLike {
  if (!isRecord(value) || typeof value.message !== 'string' || value.message === '') {
    return false
  }
  return value.path === undefined || Array.isArray(value.path)
}

/** Format an ORPCError `data` zod-issue list (`[{ message, path }]`) as one readable line. */
function formatIssueList(err: unknown): string | undefined {
  if (!isRecord(err) || !isUnknownArray(err.data)) {
    return undefined
  }
  const issues = err.data.filter(isIssueLike)
  if (issues.length === 0) {
    return undefined
  }
  return issues
    .map((issue) => {
      const path = issue.path === undefined ? '' : issue.path.map(String).join('.')
      return path === '' ? issue.message : `${path}：${issue.message}`
    })
    .join('；')
}
