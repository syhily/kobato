import { strategyToConfig, type SafeHtmlStrategy } from '@kobato/sanitize/config.ts'
import { sanitizeHtmlEngine } from '@kobato/sanitize/engine.node.ts'

// Facade over the per-platform sanitize engines; every behavioral rule lives in
// the shared purify core, so SSR and hydration bytes cannot drift.
export function sanitizeHtmlString(html: string, strategy: SafeHtmlStrategy): string {
  return sanitizeHtmlEngine(html, strategyToConfig(strategy))
}

export { sanitizeHtmlString as sanitizeHtml }
