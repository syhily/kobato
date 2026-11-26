import type { Context } from 'hono'

import { randomBytes } from 'node:crypto'

export interface SpaShellEnv {
  Variables: {
    requestContext?: {
      cspNonce?: string
    }
  }
}

export type SpaShellHandler = (c: Context<SpaShellEnv>) => Response

export interface SpaShellHandlerOptions {
  loadHtml: () => string
  buildCsp: (nonce: string) => string
  isHttps: () => boolean
}

const HSTS_HEADER = 'max-age=15552000; includeSubDomains'
const SCRIPT_TAG = /<script(?=[\s>])([^>]*)>/gi
const CARRIES_NONCE = /(?<![\w-])nonce\s*=/i

function injectNonce(html: string, nonce: string): string {
  return html.replace(SCRIPT_TAG, (match, attributes: string) =>
    CARRIES_NONCE.test(attributes) ? match : `<script${attributes} nonce="${nonce}">`,
  )
}

function requestNonce(c: Context<SpaShellEnv>): string {
  const rc = c.get('requestContext')
  const nonce = rc?.cspNonce
  return typeof nonce === 'string' && nonce !== '' ? nonce : randomBytes(16).toString('base64')
}

export function createSpaShellHandler(options: SpaShellHandlerOptions): SpaShellHandler {
  return (c) => {
    const method = c.req.method
    if (method !== 'GET' && method !== 'HEAD') {
      return c.body(null, 404)
    }
    const nonce = requestNonce(c)
    const headers: Record<string, string> = {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': options.buildCsp(nonce),
      'Cache-Control': 'no-store',
    }
    if (options.isHttps()) {
      headers['Strict-Transport-Security'] = HSTS_HEADER
    }
    if (method === 'HEAD') {
      return c.body(null, 200, headers)
    }
    return c.body(injectNonce(options.loadHtml(), nonce), 200, headers)
  }
}
