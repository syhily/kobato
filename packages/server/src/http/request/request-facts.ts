import type { RequestFacts } from '@kobato/server/infra/http/request-facts'

import { ANALYTICS_EVENT_HEADER } from '@kobato/api/client/analytics-event'
import { randomUUID } from 'node:crypto'

const ANALYTICS_EVENT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function analyticsEventId(headers: Headers): string {
  const inbound = headers.get(ANALYTICS_EVENT_HEADER)
  return inbound !== null && ANALYTICS_EVENT_ID_PATTERN.test(inbound) ? inbound : randomUUID()
}

export function normalizeDocumentUrl(url: URL): URL {
  const normalized = new URL(url.href)
  const { pathname } = normalized
  if (pathname.endsWith('/_.data')) {
    normalized.pathname = `${pathname.slice(0, -'/_.data'.length)}/`
  } else if (pathname.endsWith('.data')) {
    normalized.pathname = pathname.slice(0, -'.data'.length)
  }
  normalized.searchParams.delete('_routes')
  normalized.searchParams.delete('index')
  return normalized
}

export function isDataRequestUrl(url: URL): boolean {
  return url.pathname.endsWith('.data')
}

export function extractRequestFacts(request: Request): RequestFacts {
  const headers = request.headers
  const rawUrl = new URL(request.url)
  const clientHints = {
    model: headers.get('sec-ch-ua-model'),
    platform: headers.get('sec-ch-ua-platform'),
    platformVersion: headers.get('sec-ch-ua-platform-version'),
    mobile: headers.get('sec-ch-ua-mobile'),
    brands: headers.get('sec-ch-ua-full-version-list') ?? headers.get('sec-ch-ua'),
    fullVersion: headers.get('sec-ch-ua-full-version'),
    arch: headers.get('sec-ch-ua-arch'),
    bitness: headers.get('sec-ch-ua-bitness'),
    formFactors: headers.get('sec-ch-ua-form-factors'),
  }
  return {
    analyticsEventId: analyticsEventId(headers),
    path: normalizeDocumentUrl(rawUrl).pathname,
    isDataRequest: isDataRequestUrl(rawUrl),
    userAgent: headers.get('user-agent'),
    referer: headers.get('referer'),
    acceptLanguage: headers.get('accept-language'),
    purpose: headers.get('purpose') ?? headers.get('sec-purpose'),
    cookie: headers.get('cookie'),
    clientHints: Object.values(clientHints).some((value) => value !== null) ? clientHints : null,
  }
}
