// Shared helpers for the kobato host-card exportDOM renderers. React-free and
// DOM-global-free: every DOM touch goes through the render context's injected
// document factory, so the same renderers run under the browser canvas and the
// server-side jsdom projection. `CardRenderContext` / `CardRenderOutput` are
// local structural slices of inkling's internal `RenderContext` / export
// output types, which shared/ cannot import (`@/inkling/headless` does not
// export them).

/** Structural slice of inkling's `RenderContext` the host-card renderers consume. */
export interface CardRenderContext {
  readonly createDocument: () => Document
  /** URL policy: returns `value` when it is safe for `kind`, `''` otherwise. */
  readonly safeUrl: (kind: 'navigation' | 'media', value: string) => string
  readonly sanitizeBasicHtml: (html: string) => string
  readonly escapeText: (value: string) => string
  readonly resolveRenderMeta?: ((kind: string, id: string) => unknown) | undefined
}

/** Matches inkling's `ExportDOMOutput<'inner' | 'outer'>`; `element` is the
 * lib.dom type both the browser canvas and the jsdom projection share. */
export interface CardRenderOutput {
  element: HTMLElement
  type: 'inner' | 'outer'
}

/**
 * Feed-variant signal through the open `resolveRenderMeta` seam (inkling's
 * `ExportDOMOptions` key set is closed): the projection answers `true` on the
 * feed pass and leaves it unanswered otherwise. Kind-only — every card reads
 * the same per-pass flag.
 */
export const FEED_VARIANT_META_KIND = 'kobato:feed-variant'

/** True when the current exportDOM pass is the feed (rssMode) variant. */
export function isFeedVariantRender(context: CardRenderContext): boolean {
  return context.resolveRenderMeta?.(FEED_VARIANT_META_KIND, '') === true
}

/**
 * Feed-variant URL rule: feed readers resolve URLs on another origin, so
 * origin-relative media srcs join the site origin (from the image render
 * env's `siteOrigin`, answered on both projection passes).
 */
export function absolutizeAssetSrcForFeed(src: string, siteOrigin: string | undefined): string {
  if (!src.startsWith('/') || src.startsWith('//') || siteOrigin === undefined || siteOrigin === '') {
    return src
  }
  const origin = siteOrigin.endsWith('/') ? siteOrigin.slice(0, -1) : siteOrigin
  return `${origin}${src}`
}

/**
 * Builds one element from an HTML template string — the host-side
 * counterpart of inkling's internal `getFirstHtmlElement`. The template
 * must root at exactly one element.
 */
export function elementFromHtml(document: Document, html: string, cardType: string): HTMLElement {
  const container = document.createElement('div')
  container.innerHTML = html.trim()
  const element = container.firstElementChild
  // `instanceof` goes through the owner window: the server side runs this
  // against a jsdom document, whose constructors are not the Node globals.
  const win = document.defaultView
  if (win === null || !(element instanceof win.HTMLElement)) {
    throw new Error(`[${cardType}] render template produced no root element`)
  }
  return element
}

/** The pass-through container a feed-variant renderer returns with
 * `type: 'inner'`: the children markup spliced without a wrapper. */
export function feedPassthroughElement(document: Document, innerHtml: string): HTMLElement {
  const container = document.createElement('div')
  container.innerHTML = innerHtml
  return container
}

const HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  '#39': "'",
}

/**
 * Tag-stripping HTML → text for the plain-text projection (`body_text`):
 * nested-editor content rides as opaque HTML strings, and the generated
 * `getTextContent` would leak raw markup into the search corpus. Not a
 * sanitizer — input is the save-time cleaned HTML; entity coverage is the
 * common named set.
 */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&([a-zA-Z#0-9]+);/g, (match, entity: string) => HTML_ENTITIES[entity] ?? match)
    .trim()
}
