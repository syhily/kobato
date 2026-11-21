import type { DecoratorNodeProperty } from '@kobato/inkling-internal/nodes/base/card-specs'
import type { CardImportSpec } from '@kobato/inkling-internal/nodes/base/import-spec'

import { getImageSrcset } from '@kobato/assets/images'
import {
  absolutizeAssetSrcForFeed,
  type CardRenderContext,
  type CardRenderOutput,
  elementFromHtml,
  htmlToPlainText,
  isFeedVariantRender,
} from '@kobato/inkling-internal/headless/cards/card-html'
import { unsafeCast } from '@kobato/utils/unsafe-cast'

export const KOBATO_IMAGE_LAYOUTS = ['left', 'center', 'right'] as const
export type KobatoImageLayout = (typeof KOBATO_IMAGE_LAYOUTS)[number]

export function normalizeKobatoImageLayout(value: unknown): KobatoImageLayout {
  return value === 'left' || value === 'right' ? value : 'center'
}

export const KOBATO_IMAGE_EXTRA_KEYS = ['thumbhash', 'storagePath', 'imageId', 'layout'] as const

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

export const KOBATO_IMAGE_FIGURE_CLASSES = {
  base: 'block max-w-full',
  left: 'mr-auto ml-0 w-fit',
  center: 'mx-auto w-fit',
  right: 'mr-0 ml-auto w-fit',
} as const

export const KOBATO_IMAGE_IMG_CLASS =
  'transition-[filter] duration-300 dark:[filter:brightness(0.72)_contrast(0.95)_saturate(0.9)]'

export const KOBATO_IMAGE_SRCSET_BREAKPOINTS = [256, 512, 768, 1024] as const

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
  return unsafeCast<KobatoImageRenderEnv>(value)
}

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

export function renderKobatoImageNode(node: KobatoImageDataset, context: CardRenderContext): CardRenderOutput {
  const document = context.createDocument()
  const escape = context.escapeText

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
      `<figure><img src="${escape(absolutizeAssetSrcForFeed(src, resolveKobatoImageRenderEnv(context)?.siteOrigin))}"${alt}${widthAttr}${heightAttr} />${caption}</figure>`,
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
      img += ` data-zoom-src="${escape(src)}"`
    }
  }
  img += ' />'

  const href = node.href === '' ? '' : context.safeUrl('navigation', node.href)
  const media = href === '' ? img : `<a href="${escape(href)}">${img}</a>`
  const caption = node.caption === '' ? '' : `<figcaption>${context.sanitizeBasicHtml(node.caption)}</figcaption>`

  const layoutAttr = layout === 'center' ? '' : ` data-layout="${layout}"`
  const element = elementFromHtml(
    document,
    `<figure class="${figureClass}"${layoutAttr}>${media}${caption}</figure>`,
    'image',
  )
  return { element, type: 'outer' }
}

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
