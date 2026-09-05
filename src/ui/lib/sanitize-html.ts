import { strategyToConfig, type SafeHtmlStrategy } from '@/ui/lib/sanitize-html-config'
import { sanitizeHtmlEngine } from '@/ui/lib/sanitize-html-engine.node'

// Facade over the per-platform sanitize engines (DOMPurify over a jsdom DOM
// on SSR, DOMPurify over the real window in the browser — one shared rule
// core, see sanitize-html-purify.ts). Import `SafeHtmlStrategy` from
// `sanitize-html-config` — no re-export convention.
export function sanitizeHtmlString(html: string, strategy: SafeHtmlStrategy): string {
  return sanitizeHtmlEngine(html, strategyToConfig(strategy))
}

export { sanitizeHtmlString as sanitizeHtml }
