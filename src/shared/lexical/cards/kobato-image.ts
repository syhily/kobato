// The kobato `image` card spec (plan docs/plans/inkling-editor-replacement.md,
// round R11): the stock inkling ImageNode is subclassed as `KobatoImageNode`
// because the stock exportDOM cannot meet kobato's markup fidelity bar — no
// srcset, no thumbhash, no left/right float layout — and the stock declaration
// silently drops the three host-schema pass-through keys (thumbhash /
// storagePath / imageId) the image-library insert dataset carries.
//
// Same dual-entry sharing contract as `./solution`: this React-free module is
// the single source consumed by BOTH the client node
// (`@/client/editor/kobato-image-node` — a subclass of the `.` entry's
// assembled ImageNode, since the assembled class owns the caption nested
// editor / transient upload props) AND the server projection
// (`@/server/infra/pt/lexical-projection` — a fresh headless
// `generateDecoratorNode` class declared from the full 12-property list
// below). The two class objects never cross entries.
//
// The full-fidelity export markup mirrors the PT public renderer
// (`src/ui/pt/render-blocks.tsx` ImageBlockComponent + `blocks/BlockImage`):
// layout-classed figure, lazy/async img with the dark-mode dim class,
// data-thumbhash, 100vw sizes + the [256,512,768,1024] srcset (when the
// render env supplies the assets/site facts), and the SSR-visible
// aspect-ratio fallback for dimensionless images. The feed variant
// reproduces PT rssMode (`src/server/render/pt-html.ts` renderImageBlock).

import type { CardImportSpec, DecoratorNodeProperty } from '@inkling/editor/headless'

import {
  type CardRenderContext,
  type CardRenderOutput,
  elementFromHtml,
  htmlToPlainText,
  isFeedVariantRender,
} from '@/shared/lexical/cards/card-html'
import { getImageSrcset } from '@/shared/types/images'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

/** The PT image layout vocabulary (`ImageBlockLayout` parity). `cardWidth`
 * has no left/right equivalent, so layout is a kobato-owned extra key. */
export const KOBATO_IMAGE_LAYOUTS = ['left', 'center', 'right'] as const
export type KobatoImageLayout = (typeof KOBATO_IMAGE_LAYOUTS)[number]

export function normalizeKobatoImageLayout(value: unknown): KobatoImageLayout {
  return value === 'left' || value === 'right' ? value : 'center'
}

/**
 * The four kobato-owned keys on top of the stock image dataset. The client
 * subclass persists them through hand-written getDataset/exportJSON/importJSON
 * overrides (the assembled stock class's property list is closed); the server
 * projection declares them as regular properties through KOBATO_IMAGE_PROPERTIES.
 */
export const KOBATO_IMAGE_EXTRA_KEYS = ['thumbhash', 'storagePath', 'imageId', 'layout'] as const

/**
 * The full 12-property spec: the stock eight VERBATIM (same names, defaults,
 * and flags as `packages/inkling/src/nodes/base/nodes/image/ImageNode.ts`
 * imageProperties — src additionally carries the generated exportJSON's blob
 * guard the stock hand-written exportJSON applies) plus the four kobato keys.
 * Consumed by the server projection class and the client's export delegate.
 */
export const KOBATO_IMAGE_PROPERTIES = [
  { name: 'src', default: '', urlType: 'url', redactDataUrl: true },
  { name: 'caption', default: '', urlType: 'html', wordCount: true },
  { name: 'title', default: '' },
  { name: 'alt', default: '' },
  { name: 'cardWidth', default: 'regular' },
  { name: 'width', default: null as number | null },
  { name: 'height', default: null as number | null },
  { name: 'href', default: '', urlType: 'url' },
  { name: 'thumbhash', default: '' },
  { name: 'storagePath', default: '' },
  { name: 'imageId', default: '' },
  { name: 'layout', default: 'center' },
] as const satisfies readonly DecoratorNodeProperty[]

/**
 * Figure classes, verbatim from the PT renderer's `imageFigureLayoutClass`
 * (render-blocks.tsx). The layout class is emitted for EVERY layout —
 * `mx-auto w-fit` is what centers the figure, not a default stylesheet rule.
 */
export const KOBATO_IMAGE_FIGURE_CLASSES = {
  base: 'block max-w-full',
  left: 'mr-auto ml-0 w-fit',
  center: 'mx-auto w-fit',
  right: 'mr-0 ml-auto w-fit',
} as const

/**
 * The dark-mode dimming class on the exported `<img>` — the literal of
 * `DARK_IMAGE_DIM_CLASS` (`@/ui/public/widgets/Image`), which shared/ cannot
 * import (ui → shared only). Pinned equal by the kobato-image unit test.
 */
export const KOBATO_IMAGE_IMG_CLASS =
  'transition-[filter] duration-300 dark:[filter:brightness(0.72)_contrast(0.95)_saturate(0.9)]'

/** BlockImage's srcset breakpoints (`@/ui/pt/blocks/BlockImage`). */
export const KOBATO_IMAGE_SRCSET_BREAKPOINTS = [256, 512, 768, 1024] as const

/**
 * The facts the full-fidelity srcset needs, delivered through the open
 * render-meta seam (the export-policy key set is closed): the assets
 * section's transform host/template and the site origin — the same triple
 * `BlockImage` reads from `useAssetsSettings`/`useSiteIdentity`. The server
 * projection answers this kind; the browser clipboard export leaves it
 * unanswered and the srcset is skipped (parity with a context-free copy).
 */
export const IMAGE_RENDER_ENV_META_KIND = 'kobato:image-render-env'

export interface KobatoImageRenderEnv {
  assetHost: string
  urlTemplate?: string | undefined
  siteOrigin?: string | undefined
}

export function resolveKobatoImageRenderEnv(context: CardRenderContext): KobatoImageRenderEnv | undefined {
  const value: unknown = context.resolveRenderMeta?.(IMAGE_RENDER_ENV_META_KIND, '')
  if (typeof value !== 'object' || value === null || !('assetHost' in value)) {
    return undefined
  }
  // The 'assetHost' in-check above is the registry's shape guarantee.
  return unsafeCast<KobatoImageRenderEnv>(value)
}

/**
 * The dataset view the renderer reads. `layout` is typed as plain `string`
 * (the generated instance's widened type — render fns are checked by
 * contravariance against it); the renderer normalizes it.
 */
export interface KobatoImageDataset {
  src: string
  /** Inline HTML (the caption nested editor's cleaned serialization). */
  caption: string
  title: string
  alt: string
  cardWidth: string
  width: number | null
  height: number | null
  href: string
  thumbhash: string
  storagePath: string
  imageId: string
  layout: string
}

/** pt-html.ts absolutizeAssetSrc parity: feed readers resolve URLs on
 * another origin, so origin-relative srcs join the site origin. */
function absolutizeForFeed(src: string, siteOrigin: string | undefined): string {
  if (!src.startsWith('/') || src.startsWith('//') || siteOrigin === undefined || siteOrigin === '') {
    return src
  }
  const origin = siteOrigin.endsWith('/') ? siteOrigin.slice(0, -1) : siteOrigin
  return `${origin}${src}`
}

/**
 * The exportDOM render (both variants). Full fidelity: the PT figure markup.
 * Feed: the bare PT rssMode figure (no classes, no thumbhash/srcset; caption
 * as escaped plain text; src absolutized against the site origin).
 */
export function renderKobatoImageNode(node: KobatoImageDataset, context: CardRenderContext): CardRenderOutput {
  const document = context.createDocument()
  const escape = context.escapeText

  // Stock empty-source guard (renderEmptyContainer semantics): a blank or
  // policy-rejected src exports nothing.
  const src = node.src.trim() === '' ? '' : context.safeUrl('media', node.src)
  if (src === '') {
    return { element: document.createElement('span'), type: 'inner' }
  }

  const width = node.width !== null && node.width > 0 ? node.width : null
  const height = node.height !== null && node.height > 0 ? node.height : null

  if (isFeedVariantRender(context)) {
    const alt = node.alt !== '' ? ` alt="${escape(node.alt)}"` : ''
    const widthAttr = width !== null ? ` width="${width}"` : ''
    const heightAttr = height !== null ? ` height="${height}"` : ''
    const captionText = htmlToPlainText(node.caption)
    const caption = captionText === '' ? '' : `<figcaption>${escape(captionText)}</figcaption>`
    const element = elementFromHtml(
      document,
      `<figure><img src="${escape(absolutizeForFeed(src, resolveKobatoImageRenderEnv(context)?.siteOrigin))}"${alt}${widthAttr}${heightAttr} />${caption}</figure>`,
      'image',
    )
    return { element, type: 'outer' }
  }

  const layout = normalizeKobatoImageLayout(node.layout)
  const figureClass = `${KOBATO_IMAGE_FIGURE_CLASSES.base} ${KOBATO_IMAGE_FIGURE_CLASSES[layout]}`

  let img = `<img src="${escape(src)}" class="${KOBATO_IMAGE_IMG_CLASS}" alt="${escape(node.alt)}" loading="lazy" decoding="async" sizes="100vw"`
  if (node.title !== '') {
    img += ` title="${escape(node.title)}"`
  }
  if (width !== null && height !== null) {
    img += ` width="${width}" height="${height}"`
  } else {
    // BlockImage's SSR-visible fallback for dimensionless images.
    img += ' style="aspect-ratio:16/9"'
  }
  if (node.thumbhash !== '') {
    img += ` data-thumbhash="${escape(node.thumbhash)}"`
  }
  const env = resolveKobatoImageRenderEnv(context)
  if (env !== undefined && width !== null && height !== null) {
    const srcset = getImageSrcset({
      src,
      width,
      height,
      assetHost: env.assetHost,
      urlTemplate: env.urlTemplate,
      siteOrigin: env.siteOrigin,
      breakpoints: [...KOBATO_IMAGE_SRCSET_BREAKPOINTS],
    })
    if (srcset !== '') {
      img += ` srcset="${escape(srcset)}"`
    }
  }
  img += ' />'

  // Stock behaviour (no PT equivalent — a small enhancement): a safe href
  // wraps the image in a link.
  const href = node.href === '' ? '' : context.safeUrl('navigation', node.href)
  const media = href === '' ? img : `<a href="${escape(href)}">${img}</a>`
  const caption = node.caption === '' ? '' : `<figcaption>${context.sanitizeBasicHtml(node.caption)}</figcaption>`

  // `data-layout` rides along for non-center layouts so a copy of the public
  // markup pastes back with its float intact (PT had no such attribute; the
  // layout CLASSES alone are not reliably machine-readable).
  const layoutAttr = layout === 'center' ? '' : ` data-layout="${layout}"`
  const element = elementFromHtml(
    document,
    `<figure class="${figureClass}"${layoutAttr}>${media}${caption}</figure>`,
    'image',
  )
  return { element, type: 'outer' }
}

/**
 * `getTextContent` override body for the server-registered class — PT plain
 * text parity (`@/shared/pt/utils` pushBlockText): an image contributes its
 * ALT text, never the caption HTML (the generated getTextContent would leak
 * the raw markup into the `body_text` corpus).
 */
export function kobatoImageTextContent(node: { __alt?: unknown }): string {
  const alt = typeof node.__alt === 'string' ? node.__alt : ''
  return alt === '' ? '' : `${alt}\n\n`
}

/**
 * Port of inkling's `readImageAttributesFromElement` (not exported from the
 * dist entries) — the composite img read of the import spec: src / width /
 * height / alt / title off the img element, href off a wrapping anchor.
 * tagName checks instead of instanceof: the imported document can come from
 * another realm (a separate jsdom in tests).
 */
export function readKobatoImageAttributes(element: Element): Record<string, string | number> {
  const attrs: Record<string, string | number> = {}
  if (element.tagName !== 'IMG') {
    return attrs
  }
  // tagName-guarded: the imported document can come from another realm.
  const img = unsafeCast<HTMLImageElement>(element)

  if (img.src) {
    attrs.src = img.src
  }
  if (img.width) {
    attrs.width = img.width
  }
  if (img.height) {
    attrs.height = img.height
  }
  if (img.alt) {
    attrs.alt = img.alt
  }
  const title = img.getAttribute('title')
  if (title) {
    attrs.title = title
  }

  const parent = img.parentElement
  if (parent?.tagName === 'A') {
    const href = parent.getAttribute('href')
    if (href && href !== attrs.src) {
      attrs.href = href
    }
  }

  return attrs
}

/**
 * The DOM-import spec — the stock `imageImportSpec` conversions (img tag,
 * figure-with-img) plus the kobato keys our own export markup carries back
 * in: `data-layout` on the figure and `data-thumbhash` on the img.
 * `storagePath`/`imageId` deliberately never enter HTML (the public page
 * must not leak storage internals), so a copy/paste round-trip drops them —
 * the library linkage is re-derived by the save-time image sync.
 *
 * The client subclass redeclares `static importSpec` with this object; the
 * subclass path never re-runs `validateImportSpec`, so the reads naming the
 * four extra keys are safe there. The server projection declares all twelve
 * properties, so its class-creation validation passes too.
 */
export const kobatoImageImportSpec = {
  conversions: [
    {
      tag: 'img',
      priority: 1,
      reads: [
        {
          name: 'imageAttributes',
          kind: 'composite',
          read: readKobatoImageAttributes,
          provides: ['src', 'width', 'height', 'alt', 'title', 'href'],
        },
        { name: 'thumbhash', kind: 'attribute', attribute: 'data-thumbhash', omit: 'falsy' },
      ],
    },
    {
      tag: 'figure',
      // generically parses figure elements, so it must run after others (like the gallery)
      priority: 0,
      guardSelector: 'img',
      reads: [
        {
          name: 'imageAttributes',
          kind: 'composite',
          selector: 'img',
          read: readKobatoImageAttributes,
          provides: ['src', 'width', 'height', 'alt', 'title', 'href'],
        },
        { name: 'thumbhash', kind: 'attribute', attribute: 'data-thumbhash', selector: 'img', omit: 'falsy' },
        {
          name: 'layout',
          kind: 'attribute',
          attribute: 'data-layout',
          parse: (raw: string) => (raw === 'left' || raw === 'right' ? raw : undefined),
        },
        {
          name: 'cardWidth',
          kind: 'classMap',
          classMap: [
            { pattern: /inkling-width-(wide|full)/ },
            { pattern: /graf--layout(FillWidth|OutsetCenter)/, map: { FillWidth: 'full', OutsetCenter: 'wide' } },
          ],
        },
        { name: 'caption', kind: 'caption', fallback: '' },
      ],
    },
  ],
} satisfies CardImportSpec
