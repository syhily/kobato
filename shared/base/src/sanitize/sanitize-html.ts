import { strategyToConfig, type SafeHtmlStrategy } from '@kobato/base/sanitize/config'
import { sanitizeHtmlEngine } from '@kobato/base/sanitize/engine.node'

export function sanitizeHtmlString(html: string, strategy: SafeHtmlStrategy): string {
  return sanitizeHtmlEngine(html, strategyToConfig(strategy))
}

export { sanitizeHtmlString as sanitizeHtml }
