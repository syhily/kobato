import { toastApiError } from '@kobato/client/lib/toast-api-error'
import { extractApiErrorMessage } from '@kobato/shared/utils/api-error'
import { useCallback, useState } from 'react'
import { useRouteLoaderData } from 'react-router'
import { toast } from 'sonner'

// Shared adapter for the admin "upload a file to an /api/* resource route"
// flows: CSRF token from the root loader, extension/size guards, multipart
// POST, `{ error: { message } }` unwrapping. Uploads deliberately bypass
// the oRPC client — the resource routes sit behind their own (larger) body
// limits.

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
  /** Resource route accepting the multipart POST. */
  endpoint: string
  /** Extra fields appended to the FormData ahead of the file (File uploads only). */
  fields?: Record<string, string>
  /**
   * Extension allowlist; each entry is a lowercase dotted suffix matched
   * against the file name (e.g. '.svg', '.sql.gz'). Omit to skip the type
   * guard. Guards only run for File inputs — a prebuilt FormData is posted
   * as-is.
   */
  accept?: readonly string[]
  /** Size cap in bytes. Omit to skip the size guard. */
  maxBytes?: number
  /** Fetch credentials mode for the POST. */
  credentials?: RequestCredentials
  /**
   * Parse the response body as JSON immediately — before the ok check — and
   * hand it to onSuccess / the error extractor. A malformed body then lands
   * in the failure channel like a transport error. Required by flows that
   * inspect the success payload (e.g. /api/setup/restore's `accepted` flag).
   */
  parseJson?: boolean
  messages?: FileUploadMessages
  /**
   * Runs after a successful POST (revalidation, cache invalidation,
   * follow-up UX). Awaited; receives the parsed body when parseJson is set.
   */
  onSuccess?: (body: unknown) => void | Promise<void>
  /**
   * When set, EVERY failure channel (guard, HTTP, transport) routes the
   * message here instead of toast.error — for views that render errors
   * inline. Guard failures pass `description ?? title`.
   */
  onError?: (message: string) => void
}

export interface UseFileUploadResult {
  /** Run the full choreography. Resolves true on success, false on any handled failure. */
  upload: (input: File | FormData) => Promise<boolean>
  /** True while a request is in flight. */
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
            return false
          }
          throw new Error(message)
        }
        if (messages?.success !== undefined) {
          toast.success(messages.success)
        }
        await onSuccess?.(body)
        return true
      } catch (err) {
        const fallback = messages?.failure ?? '上传失败'
        if (onError) {
          // Inline-error mode: the thrown value is a transport / parse
          // failure or an onSuccess throw — never a server message (the
          // !res.ok path already returned), so surface the fixed fallback.
          onError(fallback)
        } else {
          toastApiError(err, fallback)
        }
        return false
      } finally {
        setPending(false)
      }
    },
    [options, csrfToken],
  )

  return { upload, pending }
}
