import { useCallback, useState } from 'react'
import { useRouteLoaderData } from 'react-router'
import { toast } from 'sonner'

import { toastApiError } from '@/client/lib/toast-api-error'
import { extractApiErrorMessage } from '@/shared/utils/api-error'

// Shared admin upload adapter for `/api/*` resource routes: CSRF from the
// root loader, accept/size guards, multipart POST, `{ error: { message } }`
// unwrap. Deliberately bypasses oRPC — resource routes have larger body limits.

export interface FileUploadToast {
  title: string
  description?: string
}

export interface FileUploadMessages {
  /** Type-guard failure (`accept` mismatch). Defaults to a bare 文件类型错误 toast. */
  invalidType?: FileUploadToast
  /** Size-guard failure. Receives the offending file so the copy can quote its size. */
  tooLarge?: (file: File) => FileUploadToast
  /** Success toast body. Omit to skip the success toast (custom onSuccess UX). */
  success?: string
  /** Fallback when the server error body carries no extractable message. Defaults to `上传失败 (<status>)`. */
  httpFailure?: (status: number) => string
  /** Fallback for transport failures and non-Error throws. Defaults to 上传失败. */
  failure?: string
}

export interface UseFileUploadOptions {
  endpoint: string
  /** Extra fields appended to the FormData ahead of the file (File uploads only). */
  fields?: Record<string, string>
  /** Dotted-suffix allowlist matched against the file name (e.g. '.svg', '.sql.gz'); omit to skip the type guard. Guards only run for File inputs. */
  accept?: readonly string[]
  /** Size cap in bytes. Omit to skip the size guard. */
  maxBytes?: number
  /** Fetch credentials mode for the POST. */
  credentials?: RequestCredentials
  /** Parse the response body as JSON before the ok check; a malformed body lands in the failure channel like a transport error. */
  parseJson?: boolean
  messages?: FileUploadMessages
  /** Runs after a successful POST; awaited, receives the parsed body when parseJson is set. */
  onSuccess?: (body: unknown) => void | Promise<void>
  /** When set, every failure channel routes here instead of toast.error; guard failures pass `description ?? title`. */
  onError?: (message: string) => void
}

export interface UseFileUploadResult {
  /** Run the full choreography. Resolves true on success, false on any handled failure. */
  upload: (input: File | FormData) => Promise<boolean>
  pending: boolean
}

const defaultHttpFailure = (status: number): string => `上传失败 (${status})`
const defaultTooLarge = (): FileUploadToast => ({ title: '文件过大' })

export function useFileUpload(options: UseFileUploadOptions): UseFileUploadResult {
  const rootData = useRouteLoaderData<{ csrfToken?: string }>('root')
  const csrfToken = rootData?.csrfToken
  const [pending, setPending] = useState(false)

  const upload = useCallback(
    async (input: File | FormData): Promise<boolean> => {
      const { endpoint, fields, accept, maxBytes, credentials, parseJson, messages, onSuccess, onError } = options

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
          return reportGuardFailure(messages?.invalidType ?? { title: '文件类型错误' })
        }
        if (maxBytes !== undefined && input.size > maxBytes) {
          const payload = messages?.tooLarge === undefined ? defaultTooLarge() : messages.tooLarge(input)
          return reportGuardFailure(payload)
        }
      }

      setPending(true)
      // React Compiler can't lower try/finally or throw-inside-try, so the
      // failure is captured and handled after the try/catch, ahead of the
      // pending reset (the same ordering the finally block had).
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
          const message = extractApiErrorMessage(data) ?? (messages?.httpFailure ?? defaultHttpFailure)(res.status)
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
        const fallback = messages?.failure ?? '上传失败'
        if (onError) {
          // Inline-error mode: only transport/parse/onSuccess throws land here — the !res.ok path already reported its message.
          onError(fallback)
        } else {
          toastApiError(failure, fallback)
        }
      }
      setPending(false)
      return succeeded
    },
    [options, csrfToken],
  )

  return { upload, pending }
}
