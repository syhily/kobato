import { strategyToConfig, type SafeHtmlStrategy } from '@kobato/sanitize/config.ts'
import { sanitizeHtmlEngine } from '@kobato/sanitize/engine.node.ts'

export function sanitizeHtmlString(html: string, strategy: SafeHtmlStrategy): string {
  return sanitizeHtmlEngine(html, strategyToConfig(strategy))
}

export { sanitizeHtmlString as sanitizeHtml }
