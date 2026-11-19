import type { Context } from 'hono'

type ResBindingsContext = Context<{
  Variables: { requestId: string }
}>

const L5_REQ_HEADERS = new Set(['authorization', 'proxy-authorization', 'x-csrf-token', 'cookie'])
const L3_REQ_HEADERS = new Set([
  'user-agent',
  'x-forwarded-for',
  'cf-connecting-ip',
  'true-client-ip',
  'x-real-ip',
  'forwarded',
])

export function sanitizeReqHeaders(headers: Record<string, string | undefined>): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {}
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase()
    if (L5_REQ_HEADERS.has(lower)) {
      out[key] = '[REDACTED]'
    } else if (L3_REQ_HEADERS.has(lower) && value) {
      out[key] = `{E}${value}{/E}`
    } else {
      out[key] = value
    }
  }
  return out
}

export function resBindings(c: ResBindingsContext) {
  const headers: Record<string, string> = {}
  c.res.headers.forEach((value, key) => {
    headers[key] = key.toLowerCase() === 'set-cookie' && value ? '[REDACTED]' : value
  })
  return { requestId: c.var.requestId, res: { status: c.res.status, headers } }
}
