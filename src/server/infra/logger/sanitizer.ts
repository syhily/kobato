import type { Context } from 'hono'

/**
 * Structural shape of the Hono context slice `resBindings` reads. Avoids
 * parameterising on the project's `Env` (which lives under `http/`) so the
 * infra layer keeps no upwards dependency.
 */
type ResBindingsContext = Context<{
  Variables: { requestId: string }
}>

/**
 * Privacy-aware request header sanitisation for Pino HTTP logging.
 *
 * L5: authorization tokens must NEVER reach logs — they are redacted entirely.
 * L3: cookie, user-agent, and any header carrying IP need {E}…{/E} markers
 * per `src/server/infra/logger.ts` privacy tagging convention.
 */
const L5_REQ_HEADERS = new Set(['authorization'])
const L3_REQ_HEADERS = new Set([
  'cookie',
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
    headers[key] = key.toLowerCase() === 'set-cookie' && value ? `{E}${value}{/E}` : value
  })
  return { requestId: c.var.requestId, res: { status: c.res.status, headers } }
}
