import { toast } from 'sonner'

import { extractApiErrorMessage } from '@/shared/utils/api-error'

/**
 * Uniform error toast for API/mutation failures. The caller owns the title
 * (a stable action label like '保存失败'); the server copy rides in the
 * description — `{ error: { message } }` wire bodies first (resource-route
 * fetches), then the ORPCError/Error message, then a bare string. The raw
 * `err.message` never becomes the title, so technical details don't flood
 * the headline. Lives in client/lib (not ui/lib) so client/ hooks like
 * `useFileUpload` can use it without breaking the boundaries contract.
 */
export function toastApiError(err: unknown, title: string): void {
  const description = apiErrorDescription(err)
  if (description === undefined) {
    toast.error(title)
  } else {
    toast.error(title, { description })
  }
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
