import { strategyToConfig, type SafeHtmlStrategy } from '@/ui/lib/sanitize-html-config'
import { sanitizeHtmlEngine } from '@/ui/lib/sanitize-html-engine.node'

// Facade over the per-platform sanitize engines (sanitize-html SSR, DOMPurify
// browser). Import `SafeHtmlStrategy` from `sanitize-html-config` — no re-export convention.
export function sanitizeHtmlString(html: string, strategy: SafeHtmlStrategy): string {
  return sanitizeHtmlEngine(html, strategyToConfig(strategy))
}

export { sanitizeHtmlString as sanitizeHtml }
