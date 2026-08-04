import { sanitizeHtmlEngine } from '@kobato/editor/lib/sanitize-html-engine.node'
import { strategyToConfig, type SafeHtmlStrategy } from '@kobato/shared/sanitize-html-config'

// Facade over the per-platform sanitize engines. Strategy data lives in
// `sanitize-html-config`; the node engine (sanitize-html) serves SSR, and
// vite's client environment aliases the engine import to the DOMPurify
// browser engine. The `SafeHtmlStrategy` type lives in
// `sanitize-html-config` — import it from there (no re-export convention).
export function sanitizeHtmlString(html: string, strategy: SafeHtmlStrategy): string {
  return sanitizeHtmlEngine(html, strategyToConfig(strategy))
}

export { sanitizeHtmlString as sanitizeHtml }
