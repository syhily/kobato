// Isomorphic API error-shape helpers shared by the upload hook and the
// admin views (can't live in ui/lib — boundaries contract).

export function extractApiErrorMessage(data: unknown): string | undefined {
  if (typeof data !== 'object' || data === null) {
    return undefined
  }
  if (!('error' in data)) {
    return undefined
  }
  const error = data.error
  if (typeof error !== 'object' || error === null) {
    return undefined
  }
  if (!('message' in error)) {
    return undefined
  }
  return typeof error.message === 'string' ? error.message : undefined
}

export function isApiAccepted(data: unknown): boolean {
  return typeof data === 'object' && data !== null && 'accepted' in data && data.accepted === true
}

interface IssueLike {
  message: string
  path?: PropertyKey[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value)
}

function isIssueLike(value: unknown): value is IssueLike {
  if (!isRecord(value) || typeof value.message !== 'string' || value.message === '') {
    return false
  }
  return value.path === undefined || Array.isArray(value.path)
}

/**
 * The stable `messageKey` of a rejection carrying the descriptor payload
 * (`error.data = { descriptor, issues? }`) — client branches compare THIS, never
 * localized prose. `undefined` for legacy/raw errors.
 */
export function apiErrorDescriptorKey(error: unknown): string | undefined {
  if (!isRecord(error)) {
    return undefined
  }
  const data = error.data
  if (!isRecord(data) || !('descriptor' in data)) {
    return undefined
  }
  const descriptor = data.descriptor
  if (!isRecord(descriptor) || typeof descriptor.messageKey !== 'string') {
    return undefined
  }
  return descriptor.messageKey
}

/** The descriptor-based `data` payload (`{descriptor, issues?}`) — the server already folded its summary. */
function isDescriptorData(value: unknown): boolean {
  return isRecord(value) && 'descriptor' in value
}

/** Format a LEGACY ORPCError `data` zod-issue list (`[{ message, path }]`) as one readable line. */
export function formatApiErrorIssues(error: unknown): string | undefined {
  if (!isRecord(error) || isDescriptorData(error.data)) {
    return undefined
  }
  if (!isUnknownArray(error.data)) {
    return undefined
  }
  const issues = error.data.filter(isIssueLike)
  if (issues.length === 0) {
    return undefined
  }
  return issues
    .map((issue) => {
      const path = issue.path === undefined ? '' : issue.path.map(String).join('.')
      return path === '' ? issue.message : `${path}：${issue.message}`
    })
    .join('；')
}

/** Fold the zod-issue detail into an Error's message in place, so every
 *  downstream consumer (toasts, error views, logs) names the failing field
 *  instead of showing a bare "设置数据无效". Applied once per rejection by
 *  the oRPC link interceptor (`@/client/api/client`).
 *
 *  Descriptor-based responses are skipped: the server already localized the
 *  top-level message and folded the issue summary into it, so re-appending the
 *  (now structured) issues would duplicate the text and leak keys. Bare-array
 *  `data` (oRPC's own validation errors, legacy servers) keeps the old path. */
export function enrichApiErrorMessage(error: unknown): void {
  if (!(error instanceof Error)) {
    return
  }
  const issues = formatApiErrorIssues(error)
  if (issues === undefined) {
    return
  }
  error.message = error.message === '' ? issues : `${error.message}：${issues}`
}
