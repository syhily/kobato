import DOMPurify, { type Config as DOMPurifyConfig, type WindowLike } from 'dompurify'

import type {
  ExportDOMDom,
  ExportDOMOptions,
  ExportPolicyKey,
  ImageOptimizationOptions,
} from '@/inkling/nodes/base/export-dom'

import { cleanDOM } from '@/inkling/nodes/base/utils/clean-dom'
import { isLocalContentImage as isLocalContentImageImpl } from '@/inkling/nodes/base/utils/content-image-url'
import { escapeHtml } from '@/inkling/nodes/base/utils/escape-html'
import { isSafeMediaUrl, isSafeUrl } from '@/inkling/nodes/base/utils/is-safe-url'
import { createHeadingIdTracker } from '@/inkling/utils/heading-id-tracker'
import { sanitizeHtml } from '@/inkling/utils/sanitize-html'

/**
 * The read-only render context: the single view of export-time policy and data,
 * and the only thing card renderers receive besides the node. Card sources must
 * not import the policy modules (`is-safe-url`, `escape-html`, `clean-dom`,
 * `sanitize-html`) directly — the guard in
 * `test/nodes-base/nodes/render-policy-imports.test.ts` enforces the seam.
 * Frozen shallowly: nested `imageOptimization` values stay shared references and
 * must not carry mutable state. A context is built per render pass and never
 * shared, which is why the map `trackIdAttribute` mutates is safe.
 */

export type SafeUrlKind = 'navigation' | 'media'

/** A `sanitizeCardHtml` config selecting the cleanDOM unwrap-allowlist fallback instead of DOMPurify; the config names only the tag allowlist. */
export interface UnwrapAllowlistConfig {
  readonly implementation: 'unwrap-allowlist'
  readonly allowedTags: string[]
}

/** A DOMPurify config whose `sanitize()` still returns a string (the DOM/fragment/trusted-type return keys are omitted). */
export type SanitizeToStringConfig = Omit<DOMPurifyConfig, 'RETURN_DOM' | 'RETURN_DOM_FRAGMENT' | 'RETURN_TRUSTED_TYPE'>

export type CardHtmlConfig = SanitizeToStringConfig | UnwrapAllowlistConfig

/**
 * Callout's nested-editor allowlist, kept behind cleanDOM: a plain DOMPurify
 * config cannot reproduce cleanDOM's per-tag attribute policy (`ALLOWED_ATTR`
 * is global, so it keeps `style` on MARK and arbitrary styles on CODE) nor its
 * `<script>`-unwrap behaviour.
 */
export const CALLOUT_HTML_CONFIG: UnwrapAllowlistConfig = {
  implementation: 'unwrap-allowlist',
  allowedTags: ['A', 'STRONG', 'EM', 'B', 'I', 'BR', 'CODE', 'MARK', 'S', 'DEL', 'U', 'SUP', 'SUB'],
}

/**
 * The code card's server-prerendered Shiki artifact: dual-theme output carries
 * both themes in each token span's inline `style` as CSS custom properties, so
 * `SPAN[style]` must survive. Inkling never runs Shiki — the artifact is filled
 * host-side (CSP: no wasm in the browser) and only carried here.
 */
export const SHIKI_HTML_CONFIG: SanitizeToStringConfig = {
  ALLOWED_TAGS: ['pre', 'code', 'span'],
  ALLOWED_ATTR: ['class', 'style'],
}

/**
 * The math family's server-prerendered KaTeX artifacts: a MathML tree or an SVG
 * tree, whose element/attribute vocabularies DOMPurify's built-in profiles own.
 * Inkling never runs KaTeX — the artifact is filled host-side (CSP: no wasm in
 * the browser).
 */
export const MATH_HTML_CONFIG: SanitizeToStringConfig = {
  USE_PROFILES: { mathMl: true, svg: true },
}

function isUnwrapAllowlistConfig(config: CardHtmlConfig): config is UnwrapAllowlistConfig {
  return 'implementation' in config && config.implementation === 'unwrap-allowlist'
}

/**
 * Accepts hex, rgb/rgba, and CSS named colors; rejects arbitrary strings to keep
 * interpolated style values safe. The header renderer's `safeColor` stays the
 * consumer, and `'transparent'` must keep matching the named-color arm.
 */
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

/**
 * Validates the host-supplied bag into the typed snapshot: each documented key
 * is copied only when its runtime type matches, so a mistyped option degrades to
 * "absent" (the consumers' fallback path) instead of being frozen in as a lie.
 */
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
  /** Frozen snapshot of the image-optimization bag (absent when not passed). */
  readonly imageOptimization: ImageOptimizationOptions | undefined
  readonly canTransformImage: ((src: string) => boolean) | undefined
  readonly canTransformImageToFormat: ((format: string) => boolean) | undefined
  /**
   * The markdown card's slug-policy input, consumed by `@/inkling/markdown/paste-dialect`.
   *
   * @deprecated Read `resolveExportPolicy('inkling-version')` instead — this
   * field is that call's resolved value, kept for renderer compatibility.
   */
  readonly inklingVersion: string | undefined
  /** image renderer: emit `<picture>` sources for modern formats (absent when not passed). */
  readonly pictureImageFormats: boolean | undefined
  /**
   * Keyed export-policy resolution: the host's `options.resolveExportPolicy`
   * answer, falling back to the deprecated flat option key when unanswered.
   */
  resolveExportPolicy(key: ExportPolicyKey): string | undefined
  /**
   * Request-scoped render-time meta resolver, carried by reference (absent when
   * not passed). Synchronous by contract.
   */
  readonly resolveRenderMeta: ((kind: string, id: string) => unknown) | undefined
  /** Resolved once: `options.createDocument` / `options.dom` / the browser global, in that order. */
  readonly createDocument: () => Document
  /** URL policy: returns `value` when it is safe for `kind`, `''` otherwise. */
  safeUrl(kind: SafeUrlKind, value: string): string
  /**
   * Local-content check closing over the `siteUrl`/`imageBaseUrl` captured at
   * build time, so callers cannot forget to forward them.
   */
  isLocalContentImage(url: string): boolean
  /**
   * Default-config `sanitizeHtml` under a content-neutral name, shared by caption
   * call sites and non-caption HTML (the markdown card's rendered body).
   */
  sanitizeBasicHtml(html: string): string
  /**
   * Plain-text template escaping, the single escaping path behind the seam.
   * Stays on `escapeHtml` because DOMPurify cannot reproduce it: it preserves
   * benign inline markup, strips `<img onerror>`, rewrites `<script>` to the
   * `js-embed-placeholder` `<pre>`, and does not entity-escape `&`/quotes.
   */
  escapeText(value: string): string
  /**
   * Card-HTML sanitization with an explicit named config. DOMPurify configs
   * run through DOMPurify; `unwrap-allowlist` configs run through the
   * cleanDOM fallback (see `CALLOUT_HTML_CONFIG`).
   */
  sanitizeCardHtml(html: string, config: CardHtmlConfig): string
  /**
   * Heading-id deduplication: records one use of the slugified base `id` and
   * returns the id to emit — the base id on first use, `<id>-<n>` on repeats.
   * The one mutable-state method on the context; the map is internal per-render
   * state, safe because a context is never shared across renders.
   */
  trackIdAttribute(id: string): string
}

function resolveCreateDocument(options: ExportDOMOptions): () => Document {
  if (options.createDocument) {
    // A truthy non-function `createDocument` is a caller bug; the pinned
    // TypeError message names the markdown renderer, whose test fixes the text.
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

  // globalThis, not a bare `window` read: in a non-browser render the global
  // binding does not exist, and `globalThis.window` is undefined instead of a
  // ReferenceError
  const document = globalThis.window?.document

  if (!document) {
    throw new Error('Must be passed a `createDocument` function as an option when used in a non-browser environment')
  }

  return function () {
    return document
  }
}

/**
 * The pass-through half of the seam: options copied verbatim onto the context
 * (documented at their interface declarations). A new pass-through option joins
 * the options type, the interface, and this list.
 */
type VerbatimOptions = Pick<
  RenderContext,
  'canTransformImage' | 'canTransformImageToFormat' | 'pictureImageFormats' | 'resolveRenderMeta'
>

function pickVerbatimOptions(options: ExportDOMOptions): VerbatimOptions {
  // Direct per-key reads: every key is checked against ExportDOMOptions at the
  // read and against RenderContext at the return, so the two sides cannot drift
  return {
    canTransformImage: options.canTransformImage,
    canTransformImageToFormat: options.canTransformImageToFormat,
    pictureImageFormats: options.pictureImageFormats,
    resolveRenderMeta: options.resolveRenderMeta,
  }
}

/**
 * The deprecated flat option keys each policy key falls back to when the host's
 * resolver leaves it unanswered.
 */
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

  // Sanitization binds to this render's own window instead of the browser
  // global, resolved lazily so renders that never sanitize pay nothing and a
  // DOM-less environment throws only on first use.
  const browserWindow = globalThis.window?.document ? globalThis.window : undefined
  let resolvedWindow: ExportDOMDom['window'] | undefined
  const resolveWindow = (): ExportDOMDom['window'] => {
    if (resolvedWindow) {
      return resolvedWindow
    }
    // When the caller passed options.createDocument, sanitize must bind to that
    // factory's own document: options.dom?.window may point at a different one,
    // and binding window B while elements are written to document A breaks the
    // single-document invariant of one render pass.
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
      // `undefined` siteUrl/imageBaseUrl hit the same `''` defaults inside
      // is-local-content-image
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
      // The ExportDOMDom window and DOMPurify's WindowLike are unrelated
      // structural types, so the assertion stays inside the seam. One bound
      // instance per context.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- structural window types are unrelated by construction; the seam binds a real window
      boundDOMPurify ??= DOMPurify(resolveWindow() as unknown as WindowLike)
      return boundDOMPurify.sanitize(html, config)
    },
    trackIdAttribute,
  }

  return Object.freeze(context)
}
