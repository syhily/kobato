import type {
  ExportDOMDom,
  ExportDOMOptions,
  ExportPolicyKey,
  ImageOptimizationOptions,
} from '@kobato/inkling-internal/nodes/base/export-dom'

import { cleanDOM } from '@kobato/inkling-internal/nodes/base/utils/clean-dom'
import { isLocalContentImage as isLocalContentImageImpl } from '@kobato/inkling-internal/nodes/base/utils/content-image-url'
import { escapeHtml } from '@kobato/inkling-internal/nodes/base/utils/escape-html'
import { isSafeMediaUrl, isSafeUrl } from '@kobato/inkling-internal/nodes/base/utils/is-safe-url'
import { createHeadingIdTracker } from '@kobato/inkling-internal/utils/heading-id-tracker'
import { sanitizeHtml } from '@kobato/inkling-internal/utils/sanitize-html'
import DOMPurify, { type Config as DOMPurifyConfig, type WindowLike } from 'dompurify'

export type SafeUrlKind = 'navigation' | 'media'

export interface UnwrapAllowlistConfig {
  readonly implementation: 'unwrap-allowlist'
  readonly allowedTags: string[]
}

export type SanitizeToStringConfig = Omit<DOMPurifyConfig, 'RETURN_DOM' | 'RETURN_DOM_FRAGMENT' | 'RETURN_TRUSTED_TYPE'>

export type CardHtmlConfig = SanitizeToStringConfig | UnwrapAllowlistConfig

export const CALLOUT_HTML_CONFIG: UnwrapAllowlistConfig = {
  implementation: 'unwrap-allowlist',
  allowedTags: ['A', 'STRONG', 'EM', 'B', 'I', 'BR', 'CODE', 'MARK', 'S', 'DEL', 'U', 'SUP', 'SUB'],
}

export const SHIKI_HTML_CONFIG: SanitizeToStringConfig = {
  ALLOWED_TAGS: ['pre', 'code', 'span'],
  ALLOWED_ATTR: ['class', 'style'],
}

export const MATH_HTML_CONFIG: SanitizeToStringConfig = {
  USE_PROFILES: { mathMl: true, svg: true },
}

function isUnwrapAllowlistConfig(config: CardHtmlConfig): config is UnwrapAllowlistConfig {
  return 'implementation' in config && config.implementation === 'unwrap-allowlist'
}

const COLOR_VALUE_REGEX =
  /^#[0-9a-fA-F]{3,8}$|^rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(?:,\s*[\d.]+\s*)?\)$|^[a-zA-Z]+$/

export function isSafeColorValue(value: string): boolean {
  return COLOR_VALUE_REGEX.test(value)
}

function isContentImageSizes(value: unknown): value is Record<string, { width: number }> {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  return Object.values(value).every(
    (entry: unknown) =>
      typeof entry === 'object' && entry !== null && 'width' in entry && typeof entry.width === 'number',
  )
}

function readImageOptimization(bag: ImageOptimizationOptions): ImageOptimizationOptions {
  const validated: ImageOptimizationOptions = {}
  if (typeof bag.defaultMaxWidth === 'number') {
    validated.defaultMaxWidth = bag.defaultMaxWidth
  }
  if (isContentImageSizes(bag.contentImageSizes)) {
    validated.contentImageSizes = bag.contentImageSizes
  }
  if (typeof bag.srcsets === 'boolean') {
    validated.srcsets = bag.srcsets
  }
  return validated
}

export interface RenderContext {
  readonly imageOptimization: ImageOptimizationOptions | undefined
  readonly canTransformImage: ((src: string) => boolean) | undefined
  readonly canTransformImageToFormat: ((format: string) => boolean) | undefined
  /**
   * The markdown card's slug-policy input, consumed by `@kobato/inkling-internal/markdown/paste-dialect`.
   *
   * @deprecated Read `resolveExportPolicy('inkling-version')` instead — this
   * field is that call's resolved value, kept for renderer compatibility.
   */
  readonly inklingVersion: string | undefined
  readonly pictureImageFormats: boolean | undefined
  resolveExportPolicy(key: ExportPolicyKey): string | undefined
  readonly resolveRenderMeta: ((kind: string, id: string) => unknown) | undefined
  readonly createDocument: () => Document
  safeUrl(kind: SafeUrlKind, value: string): string
  isLocalContentImage(url: string): boolean
  sanitizeBasicHtml(html: string): string
  escapeText(value: string): string
  sanitizeCardHtml(html: string, config: CardHtmlConfig): string
  trackIdAttribute(id: string): string
}

function resolveCreateDocument(options: ExportDOMOptions): () => Document {
  if (options.createDocument) {
    if (typeof options.createDocument !== 'function') {
      throw new TypeError('renderMarkdownNode requires options.createDocument to be a function')
    }
    return options.createDocument
  }

  if (options.dom) {
    const dom = options.dom
    return function () {
      return dom.window.document
    }
  }

  const document = globalThis.window?.document

  if (!document) {
    throw new Error('Must be passed a `createDocument` function as an option when used in a non-browser environment')
  }

  return function () {
    return document
  }
}

type VerbatimOptions = Pick<
  RenderContext,
  'canTransformImage' | 'canTransformImageToFormat' | 'pictureImageFormats' | 'resolveRenderMeta'
>

function pickVerbatimOptions(options: ExportDOMOptions): VerbatimOptions {
  return {
    canTransformImage: options.canTransformImage,
    canTransformImageToFormat: options.canTransformImageToFormat,
    pictureImageFormats: options.pictureImageFormats,
    resolveRenderMeta: options.resolveRenderMeta,
  }
}

const LEGACY_POLICY_OPTION_KEYS: Record<ExportPolicyKey, keyof ExportDOMOptions> = {
  'footnotes-section-title': 'footnotesSectionTitle',
  'inkling-version': 'inklingVersion',
}

export function createRenderContext(options: ExportDOMOptions): RenderContext {
  const createDocument = resolveCreateDocument(options)
  const trackIdAttribute = createHeadingIdTracker()

  const resolveExportPolicy = (key: ExportPolicyKey): string | undefined => {
    const resolved = options.resolveExportPolicy?.(key)
    if (resolved !== undefined) {
      return resolved
    }
    const legacy = options[LEGACY_POLICY_OPTION_KEYS[key]]
    return typeof legacy === 'string' ? legacy : undefined
  }

  const siteUrl = options.siteUrl
  const imageBaseUrl = options.imageBaseUrl
  const imageOptimization = options.imageOptimization
    ? Object.freeze(readImageOptimization(options.imageOptimization))
    : undefined

  const browserWindow = globalThis.window?.document ? globalThis.window : undefined
  let resolvedWindow: ExportDOMDom['window'] | undefined
  const resolveWindow = (): ExportDOMDom['window'] => {
    if (resolvedWindow) {
      return resolvedWindow
    }
    const candidate: ExportDOMDom['window'] | undefined = options.createDocument
      ? (createDocument().defaultView ?? options.dom?.window ?? browserWindow)
      : (options.dom?.window ?? createDocument().defaultView ?? browserWindow)
    if (!candidate) {
      throw new Error('Must be passed a `createDocument` function as an option when used in a non-browser environment')
    }
    resolvedWindow = candidate
    return candidate
  }
  let boundDOMPurify: ReturnType<typeof DOMPurify> | undefined

  const context: RenderContext = {
    ...pickVerbatimOptions(options),
    // oxlint-disable-next-line typescript/no-deprecated -- the deprecated compatibility field is populated here, at the seam, so external renderers reading it keep working
    inklingVersion: resolveExportPolicy('inkling-version'),
    resolveExportPolicy,
    imageOptimization,
    createDocument,
    safeUrl(kind, value) {
      return (kind === 'media' ? isSafeMediaUrl(value) : isSafeUrl(value)) ? value : ''
    },
    isLocalContentImage(url) {
      return isLocalContentImageImpl(url, siteUrl, imageBaseUrl)
    },
    sanitizeBasicHtml(html) {
      return sanitizeHtml(html, undefined, resolveWindow())
    },
    escapeText(value) {
      return escapeHtml(value)
    },
    sanitizeCardHtml(html, config) {
      if (isUnwrapAllowlistConfig(config)) {
        const container = createDocument().createElement('div')
        container.innerHTML = html
        cleanDOM(container, config.allowedTags, context)
        return container.innerHTML
      }
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- structural window types are unrelated by construction; the seam binds a real window
      boundDOMPurify ??= DOMPurify(resolveWindow() as unknown as WindowLike)
      return boundDOMPurify.sanitize(html, config)
    },
    trackIdAttribute,
  }

  return Object.freeze(context)
}
