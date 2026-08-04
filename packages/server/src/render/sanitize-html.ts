import { sanitizeHtmlEngine } from '@kobato/server/render/sanitize-html-engine.node'
import { strategyToConfig, type SafeHtmlStrategy } from '@kobato/shared/sanitize-html-config'

// Server-side sanitize facade for the string renderers. Strategy data
// lives in `@kobato/shared/sanitize-html-config`; the engine (the
// sanitize-html npm package) serves SSR only — this package never
// reaches the browser. Server copy of the editor/ui facade, pinned
// against `packages/ui/lib/sanitize-html.ts` by the parity guard in
// `packages/server/tests/unit/render/sanitize-html-parity.test.ts`.
// The `SafeHtmlStrategy` type lives in `sanitize-html-config` — import
// it from there (no re-export convention).
export function sanitizeHtmlString(html: string, strategy: SafeHtmlStrategy): string {
  return sanitizeHtmlEngine(html, strategyToConfig(strategy))
}

export { sanitizeHtmlString as sanitizeHtml }
