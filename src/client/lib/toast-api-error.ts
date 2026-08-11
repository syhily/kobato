import { toast } from 'sonner'

import { extractApiErrorMessage } from '@/shared/utils/api-error'

/**
 * Uniform error toast for API/mutation failures: the caller owns the title; the server
 * copy rides in the description (`{ error: { message } }` wire bodies first, then the
 * ORPCError/Error message, then a bare string). In client/lib (not ui/lib) so client
 * hooks can use it without breaking the boundaries contract.
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
  if (wireMessage !== undefined) {
    return wireMessage
  }
  if (err instanceof Error && err.message !== '') {
    return err.message
  }
  if (typeof err === 'string' && err !== '') {
    return err
  }
  return undefined
}
