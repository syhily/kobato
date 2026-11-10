import { strategyToConfig, type SafeHtmlStrategy } from '@/shared/sanitize/config'
import { sanitizeHtmlEngine } from '@/shared/sanitize/engine.node'

// Facade over the per-platform sanitize engines; every behavioral rule lives in
// the shared purify core, so SSR and hydration bytes cannot drift.
export function sanitizeHtmlString(html: string, strategy: SafeHtmlStrategy): string {
  return sanitizeHtmlEngine(html, strategyToConfig(strategy))
}

export { sanitizeHtmlString as sanitizeHtml }
