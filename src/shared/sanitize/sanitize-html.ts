import { strategyToConfig, type SafeHtmlStrategy } from '@/shared/sanitize/config'
import { sanitizeHtmlEngine } from '@/shared/sanitize/engine.node'

// Facade over the per-platform sanitize engines (DOMPurify over a jsdom DOM
// on SSR, DOMPurify over the real window in the browser — one shared rule
// core, see purify-core.ts). Import `SafeHtmlStrategy` from
// `config` — no re-export convention.
export function sanitizeHtmlString(html: string, strategy: SafeHtmlStrategy): string {
  return sanitizeHtmlEngine(html, strategyToConfig(strategy))
}

export { sanitizeHtmlString as sanitizeHtml }
