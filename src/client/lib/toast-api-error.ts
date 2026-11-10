import { toast } from 'sonner'

import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'

import { extractApiErrorMessage } from '@/shared/utils/api-error'

/**
 * ICU values a toast title can interpolate. A structural subset of the UI
 * translator's params, so `useI18n().t` satisfies {@link ToastTranslator}
 * without this client module importing the UI layer (boundaries contract).
 */
export type ToastMessageParams = Record<string, string | number | Date | null | undefined>

/**
 * The explicit translator every helper below takes — the caller's
 * `useI18n().t`, never a module-level locale.
 */
export type ToastTranslator = (id: UiMessageId, params?: ToastMessageParams) => string

/**
 * Uniform error toast for API/mutation failures: the caller owns the title as
 * a UI message id translated through its own `t`; the server copy rides in the
 * description and is never retranslated (ORPCError messages carry the server's
 * localized copy verbatim). Placed in client/lib (not ui/lib) so client hooks
 * satisfy the boundaries contract.
 */
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

/**
 * Mutation `onError` shorthand for the toast-only failure path:
 * `onError: onMutationError('admin.toast.saveFailed', t)`.
 */
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
