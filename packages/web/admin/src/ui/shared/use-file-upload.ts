import type { UiMessageId } from '@kobato/i18n/messages/ui/en-US'
import type { ToastTranslator } from '@kobato/web-public/ui/lib/toast-api-error'

import { extractApiErrorMessage } from '@kobato/web-client/lib/api-error'
import { toastApiError } from '@kobato/web-public/ui/lib/toast-api-error'
import { useCallback, useState } from 'react'
import { useRouteLoaderData } from 'react-router'
import { toast } from 'sonner'

export interface FileUploadToast {
  title: string
  description?: string
}

export interface FileUploadMessages {
  invalidType?: FileUploadToast
  tooLarge?: (file: File) => FileUploadToast
  success?: string
  httpFailure?: (status: number) => string
  failure?: UiMessageId
}

export interface UseFileUploadOptions {
  endpoint: string
  t: ToastTranslator
  fields?: Record<string, string>
  accept?: readonly string[]
  maxBytes?: number
  credentials?: RequestCredentials
  parseJson?: boolean
  messages?: FileUploadMessages
  onSuccess?: (body: unknown) => void | Promise<void>
  onError?: (message: string) => void
}

export interface UseFileUploadResult {
  upload: (input: File | FormData) => Promise<boolean>
  pending: boolean
}

export function useFileUpload(options: UseFileUploadOptions): UseFileUploadResult {
  const rootData = useRouteLoaderData<{ csrfToken?: string }>('root')
  const csrfToken = rootData?.csrfToken
  const [pending, setPending] = useState(false)

  const upload = useCallback(
    async (input: File | FormData): Promise<boolean> => {
      const { endpoint, fields, accept, maxBytes, credentials, parseJson, messages, t, onSuccess, onError } = options

      const reportGuardFailure = (payload: FileUploadToast): false => {
        if (onError) {
          onError(payload.description ?? payload.title)
        } else {
          toast.error(payload.title, { description: payload.description })
        }
        return false
      }

      if (input instanceof File) {
        const lowerName = input.name.toLowerCase()
        if (accept !== undefined && !accept.some((ext) => lowerName.endsWith(ext))) {
          return reportGuardFailure(messages?.invalidType ?? { title: t('admin.toast.invalidFileType') })
        }
        if (maxBytes !== undefined && input.size > maxBytes) {
          const payload =
            messages?.tooLarge === undefined
              ? ({ title: t('admin.toast.fileTooLarge') } satisfies FileUploadToast)
              : messages.tooLarge(input)
          return reportGuardFailure(payload)
        }
      }

      setPending(true)
      let succeeded = false
      let failed = false
      let failure: unknown = null
      try {
        let formData: FormData
        if (input instanceof File) {
          formData = new FormData()
          for (const [key, value] of Object.entries(fields ?? {})) {
            formData.append(key, value)
          }
          formData.append('file', input)
        } else {
          formData = input
        }
        const headers: Record<string, string> = {}
        if (csrfToken) {
          headers['x-csrf-token'] = csrfToken
        }
        const res = await fetch(endpoint, {
          method: 'POST',
          body: formData,
          headers,
          ...(credentials !== undefined ? { credentials } : {}),
        })
        const body: unknown = parseJson === true ? await res.json() : undefined
        if (!res.ok) {
          const data: unknown = parseJson === true ? body : await res.json().catch(() => null)
          const message =
            extractApiErrorMessage(data) ??
            (messages?.httpFailure ?? ((status: number) => t('admin.toast.uploadStatusFailed', { status })))(res.status)
          if (onError) {
            onError(message)
          } else {
            failed = true
            failure = new Error(message)
          }
        } else {
          if (messages?.success !== undefined) {
            toast.success(messages.success)
          }
          await onSuccess?.(body)
          succeeded = true
        }
      } catch (err) {
        failed = true
        failure = err
      }
      if (failed) {
        const failureId = messages?.failure ?? 'admin.toast.uploadFailed'
        if (onError) {
          onError(t(failureId))
        } else {
          toastApiError(failure, failureId, t)
        }
      }
      setPending(false)
      return succeeded
    },
    [options, csrfToken],
  )

  return { upload, pending }
}
