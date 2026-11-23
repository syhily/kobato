import type { UiMessageId } from '@kobato/i18n/messages/ui/en-US'

import { collectRpcMetadata } from '@kobato/api/rpc/metadata'
import { uiMessagesEnUS } from '@kobato/i18n/messages/ui/en-US'

export interface RpcBodyLimit {
  path: string
  maxBytes: number
  messageKey: UiMessageId
  formatMaxBytes?: boolean
}

function isUiMessageId(value: string): value is UiMessageId {
  return value in uiMessagesEnUS
}

export const RPC_BODY_LIMITS: readonly RpcBodyLimit[] = collectRpcMetadata((meta, path) => {
  if (typeof meta !== 'object' || meta === null || !('requestBodyLimit' in meta)) {
    return undefined
  }
  const limit = meta.requestBodyLimit
  if (typeof limit !== 'object' || limit === null) {
    return undefined
  }
  if (!('maxBytes' in limit) || typeof limit.maxBytes !== 'number') {
    return undefined
  }
  if (!('messageKey' in limit) || typeof limit.messageKey !== 'string' || !isUiMessageId(limit.messageKey)) {
    return undefined
  }
  return {
    path,
    maxBytes: limit.maxBytes,
    messageKey: limit.messageKey,
    ...('formatMaxBytes' in limit && limit.formatMaxBytes === true ? { formatMaxBytes: true } : {}),
  }
})
