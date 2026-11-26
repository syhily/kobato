import type { UiMessageId } from '@kobato/i18n/messages/ui/en-US'
import type { ToastTranslator } from '@kobato/web-kit/ui/lib/toast-api-error'

import { toastApiError } from '@kobato/web-kit/ui/lib/toast-api-error'
import { useCallback, useState } from 'react'
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

export interface UseFileUploadOptions<TOutput = unknown> {
  submit: (file: File, fields: Record<string, string>) => Promise<TOutput>
  t: ToastTranslator
  fields?: Record<string, string>
  accept?: readonly string[]
  maxBytes?: number
  messages?: FileUploadMessages
  onSuccess?: (body: TOutput) => void | Promise<void>
  onError?: (message: string) => void
}

export interface UseFileUploadResult {
  upload: (input: File | FormData) => Promise<boolean>
  pending: boolean
}

function errorStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('status' in error)) {
    return undefined
  }
  return typeof error.status === 'number' ? error.status : undefined
}

function formValues(input: FormData, t: ToastTranslator): { file: File; fields: Record<string, string> } {
  const file = input.get('file')
  if (!(file instanceof File)) {
    throw new TypeError(t('common.error.uploadMissing'))
  }
  const fields: Record<string, string> = {}
  for (const [key, value] of input.entries()) {
    if (key !== 'file' && key !== 'csrf_token' && typeof value === 'string') {
      fields[key] = value
    }
  }
  return { file, fields }
}

export function useFileUpload<TOutput>(options: UseFileUploadOptions<TOutput>): UseFileUploadResult {
  const [pending, setPending] = useState(false)

  const upload = useCallback(
    async (input: File | FormData): Promise<boolean> => {
      const { submit, fields, accept, maxBytes, messages, t, onSuccess, onError } = options

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
      try {
        const parsed = input instanceof File ? { file: input, fields: fields ?? {} } : formValues(input, t)
        const body = await submit(parsed.file, { ...fields, ...parsed.fields })
        if (messages?.success !== undefined) {
          toast.success(messages.success)
        }
        await onSuccess?.(body)
        return true
      } catch (error) {
        const status = errorStatus(error)
        const statusMessage = status === undefined ? undefined : messages?.httpFailure?.(status)
        if (onError) {
          onError(statusMessage ?? (error instanceof Error ? error.message : t('admin.toast.uploadFailed')))
        } else {
          toastApiError(statusMessage ?? error, messages?.failure ?? 'admin.toast.uploadFailed', t)
        }
        return false
      } finally {
        setPending(false)
      }
    },
    [options],
  )

  return { upload, pending }
}
