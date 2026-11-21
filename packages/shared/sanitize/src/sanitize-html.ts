import { strategyToConfig, type SafeHtmlStrategy } from '@kobato/sanitize/config'
import { sanitizeHtmlEngine } from '@kobato/sanitize/engine.node'

export function sanitizeHtmlString(html: string, strategy: SafeHtmlStrategy): string {
  return sanitizeHtmlEngine(html, strategyToConfig(strategy))
}

export { sanitizeHtmlString as sanitizeHtml }
