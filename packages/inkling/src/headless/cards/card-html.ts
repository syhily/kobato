export interface CardRenderContext {
  readonly createDocument: () => Document
  /** URL policy: returns `value` when it is safe for `kind`, `''` otherwise. */
  readonly safeUrl: (kind: 'navigation' | 'media', value: string) => string
  readonly sanitizeBasicHtml: (html: string) => string
  readonly escapeText: (value: string) => string
  readonly resolveRenderMeta?: ((kind: string, id: string) => unknown) | undefined
}

export interface CardRenderOutput {
  element: HTMLElement
  type: 'inner' | 'outer'
}

export const FEED_VARIANT_META_KIND = 'kobato:feed-variant'

export function isFeedVariantRender(context: CardRenderContext): boolean {
  return context.resolveRenderMeta?.(FEED_VARIANT_META_KIND, '') === true
}

export function absolutizeAssetSrcForFeed(src: string, siteOrigin: string | undefined): string {
  if (!src.startsWith('/') || src.startsWith('//') || siteOrigin === undefined || siteOrigin === '') {
    return src
  }
  const origin = siteOrigin.endsWith('/') ? siteOrigin.slice(0, -1) : siteOrigin
  return `${origin}${src}`
}

export function elementFromHtml(document: Document, html: string, cardType: string): HTMLElement {
  const container = document.createElement('div')
  container.innerHTML = html.trim()
  const element = container.firstElementChild
  const win = document.defaultView
  if (win === null || !(element instanceof win.HTMLElement)) {
    throw new Error(`[${cardType}] render template produced no root element`)
  }
  return element
}

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

export function htmlToPlainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&([a-zA-Z#0-9]+);/g, (match, entity: string) => HTML_ENTITIES[entity] ?? match)
    .trim()
}
