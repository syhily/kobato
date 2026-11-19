import type { UiMessageId } from '@kobato/i18n/messages/ui/en-US.ts'

import { isHttpUrl } from '@kobato/utils/safe-url.ts'
import { z } from 'zod'

export const HTTP_URL_MESSAGE = 'common.error.httpUrlRequired' satisfies UiMessageId

const httpUrlSchema = z.url().refine(isHttpUrl, { message: HTTP_URL_MESSAGE })

export const optionalHttpUrlSchema = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value
  }
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}, httpUrlSchema.optional())

export const httpUrlOrEmptyStringSchema = z.preprocess(
  (value) => {
    if (value === null || value === undefined) {
      return ''
    }
    if (typeof value !== 'string') {
      return value
    }
    const trimmed = value.trim()
    return trimmed === '' ? '' : trimmed
  },
  z.union([z.literal(''), httpUrlSchema]),
)
