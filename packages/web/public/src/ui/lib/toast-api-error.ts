import type { UiMessageId } from '@kobato/i18n/messages/ui/en-US'

import { extractApiErrorMessage } from '@kobato/web-client/lib/api-error'
import { toast } from 'sonner'

export type ToastMessageParams = Record<string, string | number | Date | null | undefined>

export type ToastTranslator = (id: UiMessageId, params?: ToastMessageParams) => string

export function toastApiError(
  err: unknown,
  titleId: UiMessageId,
  t: ToastTranslator,
  params?: ToastMessageParams,
): void {
  const title = t(titleId, params)
  const description = apiErrorDescription(err)
  if (description === undefined) {
    toast.error(title)
  } else {
    toast.error(title, { description })
  }
}

export function onMutationError(
  titleId: UiMessageId,
  t: ToastTranslator,
  params?: ToastMessageParams,
): (error: unknown) => void {
  return (error) => toastApiError(error, titleId, t, params)
}

function apiErrorDescription(err: unknown): string | undefined {
  return (
    extractApiErrorMessage(err) ??
    (err instanceof Error && err.message !== '' ? err.message : typeof err === 'string' && err !== '' ? err : undefined)
  )
}
