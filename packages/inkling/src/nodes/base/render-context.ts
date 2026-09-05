import DOMPurify, { type Config as DOMPurifyConfig, type WindowLike } from 'dompurify'

import type { ExportDOMDom, ExportDOMOptions, ExportPolicyKey, ImageOptimizationOptions } from '@/nodes/base/export-dom'

import { cleanDOM } from '@/nodes/base/utils/clean-dom'
import { isLocalContentImage as isLocalContentImageImpl } from '@/nodes/base/utils/content-image-url'
import { escapeHtml } from '@/nodes/base/utils/escape-html'
import { isSafeMediaUrl, isSafeUrl } from '@/nodes/base/utils/is-safe-url'
import { createHeadingIdTracker } from '@/utils/heading-id-tracker'
import { sanitizeHtml } from '@/utils/sanitize-html'

/**
 * The render-context seam (plan 040; the fold completed in plan 042): the
 * single read-only view of export-time policy and data, and the ONLY thing
 * card renderers receive besides the node. Before the seam, renderers
 * re-implemented URL allow-lists and sanitization ad hoc; this context is
 * the one interface those policies converge behind. The migration was
 * incremental, one step per commit:
 *
 * - `safeUrl` is the URL policy (Step 3 migrates the hand-rolled
 *   `isSafeUrl`/`isSafeMediaUrl` call sites; `is-safe-url.ts` stays as the
 *   seam's private implementation).
 * - `isLocalContentImage` folds the `siteUrl`/`imageBaseUrl` forwarding into
 *   the context (Step 3b), so renderers can't drop an argument.
 * - `sanitizeBasicHtml`/`sanitizeCardHtml` converge sanitization on DOMPurify
 *   (Step 4; named configs such as callout's land here). Two recorded STOP
 *   fallbacks from the Step-4 corpus diff live behind the seam too:
 *   `escapeText` (DOMPurify cannot reproduce `escapeHtml` for the video
 *   caption corpus) and `CALLOUT_HTML_CONFIG` (DOMPurify cannot reproduce
 *   cleanDOM's per-tag attribute policy), each documented at its definition.
 *   `sanitizeBasicHtml` is the default-config sanitize under a
 *   content-neutral name, shared by caption call sites and non-caption HTML
 *   such as the markdown card's rendered body.
 * - `createDocument` resolution absorbed the deleted `addCreateDocumentOption`
 *   helper (Step 6), and `trackIdAttribute` owns the heading-id dedup map the
 *   options bag's `usedIdAttributes` used to carry.
 * - Plan 042 completed the fold: renderers and transformers receive ONLY
 *   this context. The data fields it now also carries — `imageOptimization`
 *   (a frozen snapshot), the `canTransformImage*` callbacks (by reference),
 *   and `inklingVersion` — are documented at their declarations.
 *
 * The context is read-only: scalar fields are copied, `imageOptimization` is
 * a frozen snapshot, and the object itself is frozen. The freeze is shallow —
 * nested values inside `imageOptimization` stay shared references and must
 * not carry mutable state. `trackIdAttribute` is the one exception to the read-only surface:
 * it mutates the id-dedup map, which is internal per-render state the seam
 * owns, not exposed policy. The context is cheap to build, so callers
 * construct it once per render pass (per `exportDOM` call in the card
 * dispatch, per `$convertToHtmlString` run in the string layer) and never
 * share it across renders — which is exactly why the per-render id map is
 * safe.
 *
 * Card sources must not import the policy modules (`is-safe-url`,
 * `escape-html`, `clean-dom`, `sanitize-html`) directly — the guard in
 * `test/nodes-base/nodes/render-policy-imports.test.ts` enforces the seam
 * with zero exceptions.
 */

export type SafeUrlKind = 'navigation' | 'media'

/**
 * A `sanitizeCardHtml` config that selects the cleanDOM unwrap-allowlist
 * fallback instead of DOMPurify. The attribute rules (A[href] re-validated
 * with the URL policy, CODE[style] constrained by CODE_STYLE_REGEX) are
 * cleanDOM's own defaults in `clean-dom.ts` — the config names only the tag
 * allowlist so the rules stay single-sourced.
 */
export interface UnwrapAllowlistConfig {
  readonly implementation: 'unwrap-allowlist'
  readonly allowedTags: string[]
}

/**
 * A DOMPurify config whose `sanitize()` still returns a string. Omitting
 * the DOM/fragment/trusted-type return keys keeps the seam's string return
 * honest: DOMPurify's own overloads then resolve the `string` signature
 * directly (dompurify 3.x ships overloads keyed on those config flags).
 * Structurally a pre-typed `Config` variable still assigns in — the seam
 * guards the literal case, which is how configs are passed in-repo.
 */
export type SanitizeToStringConfig = Omit<DOMPurifyConfig, 'RETURN_DOM' | 'RETURN_DOM_FRAGMENT' | 'RETURN_TRUSTED_TYPE'>

export type CardHtmlConfig = SanitizeToStringConfig | UnwrapAllowlistConfig

/**
 * Callout's nested-editor allowlist, kept behind cleanDOM as a named
 * fallback (plan 040 Step 4 STOP condition). A plain DOMPurify config
 * (`ALLOWED_TAGS`/`ALLOWED_ATTR`, with or without `FORBID_CONTENTS: []`)
 * cannot reproduce cleanDOM's output on the pinned callout corpus:
 *
 * - DOMPurify's `ALLOWED_ATTR` is global, not per-tag — it keeps
 *   `style="background:red"` on MARK and `style="position:fixed;inset:0"` on
 *   CODE, which cleanDOM strips (MARK allows no attributes; CODE[style] must
 *   match `white-space: pre-wrap`).
 * - DOMPurify drops `<script>` contents; cleanDOM unwraps the tag and keeps
 *   its text (`<div><span><script>alert(1)</script>text</span></div>` →
 *   `alert(1)text`). `FORBID_CONTENTS: []` fixes that but not the per-tag
 *   attribute policy.
 */
export const CALLOUT_HTML_CONFIG: UnwrapAllowlistConfig = {
  implementation: 'unwrap-allowlist',
  allowedTags: ['A', 'STRONG', 'EM', 'B', 'I', 'BR', 'CODE', 'MARK', 'S', 'DEL', 'U', 'SUP', 'SUB'],
}

/**
 * The code card's server-prerendered artifact (Shiki). Shiki's dual-theme
 * output carries both themes on every token span's inline `style` as CSS
 * custom properties (`--shiki-light`/`--shiki-dark`), so the sanitize must
 * keep `SPAN[style]` or the highlight collapses to plain text. The tag set
 * covers Shiki's own wrapper (`pre.shiki > code > span.line`) for artifacts
 * that include it; DOMPurify's default `ALLOW_DATA_ATTR` already passes the
 * `data-*` hooks hosts attach. Inkling never runs Shiki — the artifact is
 * filled host-side (CSP: no wasm in the browser) and only carried here.
 */
export const SHIKI_HTML_CONFIG: SanitizeToStringConfig = {
  ALLOWED_TAGS: ['pre', 'code', 'span'],
  ALLOWED_ATTR: ['class', 'style'],
}

/**
 * The math family's server-prerendered artifacts (KaTeX). A render is either
 * a MathML tree or an SVG tree — two vocabularies with their own element and
 * attribute sets (`annotation[encoding]`, `path[d]`, …) that a hand-rolled
 * allowlist would drift from, so the sanitize uses DOMPurify's built-in
 * profiles. Inkling never runs KaTeX — the artifact is filled host-side (CSP:
 * no wasm in the browser) and only carried here.
 */
export const MATH_HTML_CONFIG: SanitizeToStringConfig = {
  USE_PROFILES: { mathMl: true, svg: true },
}

function isUnwrapAllowlistConfig(config: CardHtmlConfig): config is UnwrapAllowlistConfig {
  return 'implementation' in config && config.implementation === 'unwrap-allowlist'
}

/**
 * Color validation, single-sourced here (plan 040 Step 5). Accepts hex,
 * rgb/rgba, and CSS named colors; rejects arbitrary strings to keep
 * interpolated style values safe. The header renderer's `safeColor` fallback
 * helper is the consumer — note header legitimately falls back to
 * `'transparent'`, which the named-color arm accepts, so it must not be
 * rejected here.
 */
const COLOR_VALUE_REGEX =
  /^#[0-9a-fA-F]{3,8}$|^rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(?:,\s*[\d.]+\s*)?\)$|^[a-zA-Z]+$/

/** The general color-value check (header's `safeColor` fallback helper). */
export function isSafeColorValue(value: string): boolean {
  return COLOR_VALUE_REGEX.test(value)
}

function isContentImageSizes(value: unknown): value is Record<string, { width: number }> {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  return Object.values(value).every(
    (entry) => typeof entry === 'object' && entry !== null && typeof entry.width === 'number',
  )
}

/**
 * Validates the host-supplied imageOptimization bag into the typed snapshot:
 * each documented key is copied only when its runtime type matches, so a
 * mistyped host option degrades to "absent" (the consumers' documented
 * fallback path) instead of being frozen into the context as a lie. The
 * `ImageOptimizationOptions` type itself lives in `@/nodes/base/export-dom`
 * next to `ExportDOMOptions`.
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
   * The markdown card's slug-policy input, consumed by `@/markdown/paste-dialect`.
   *
   * @deprecated Read `resolveExportPolicy('inkling-version')` instead — this
   * field is that call's resolved value, kept for renderer compatibility.
   */
  readonly inklingVersion: string | undefined
  /** image renderer: emit `<picture>` sources for modern formats (absent when not passed). */
  readonly pictureImageFormats: boolean | undefined
  /**
   * Keyed export-policy resolution (CONTEXT.md-style render-time policy):
   * the host's `options.resolveExportPolicy` answer, falling back to the
   * deprecated flat option key when the resolver leaves it unanswered.
   */
  resolveExportPolicy(key: ExportPolicyKey): string | undefined
  /**
   * Request-scoped render-time meta resolver, carried by reference (absent
   * when not passed). Synchronous by contract — see the option's declaration
   * in `@/nodes/base/export-dom`.
   */
  readonly resolveRenderMeta: ((kind: string, id: string) => unknown) | undefined
  /** Resolved once: `options.createDocument` / `options.dom` / the browser global, in that order. */
  readonly createDocument: () => Document
  /** URL policy: returns `value` when it is safe for `kind`, `''` otherwise. */
  safeUrl(kind: SafeUrlKind, value: string): string
  /**
   * Local-content check closing over the options' `siteUrl`/`imageBaseUrl`
   * captured at build time — callers can no longer forget to forward them
   * (the `b87ecc1` bug class).
   */
  isLocalContentImage(url: string): boolean
  /**
   * Default-config `sanitizeHtml` under a content-neutral name, shared by
   * caption call sites and non-caption HTML (the markdown card's rendered
   * markdown-it body). The content-neutral name exists so no caller has to
   * reach for a "caption" entry to sanitize basic HTML — the markdown
   * renderer's direct `sanitize-html` import was the render-policy
   * allowlist's last entry.
   */
  sanitizeBasicHtml(html: string): string
  /**
   * Plain-text template escaping — the single escaping path behind the seam.
   * Introduced for the fields whose pinned output is `escapeHtml`'s (video
   * captions); plan 041 routed every card renderer's template escaping
   * through it. Recorded divergence (plan 040
   * Step 4 STOP condition): the DOMPurify caption path cannot reproduce
   * `escapeHtml` on the pinned corpus — it preserves benign inline markup
   * (`This is a <b>caption</b>` keeps `<b>` instead of escaping it), strips
   * `<img onerror>` down to `<img>`, rewrites `<script>` to the
   * `js-embed-placeholder` `<pre>`, and does not entity-escape `&`/quotes.
   * The `escape-html.ts` implementation therefore stays, behind this seam.
   */
  escapeText(value: string): string
  /**
   * Card-HTML sanitization with an explicit named config. DOMPurify configs
   * run through DOMPurify; `unwrap-allowlist` configs run through the
   * cleanDOM fallback (see `CALLOUT_HTML_CONFIG`).
   */
  sanitizeCardHtml(html: string, config: CardHtmlConfig): string
  /**
   * Heading-id deduplication, folded in from the options bag's
   * `usedIdAttributes` (plan 040 Step 6): records one use of the slugified
   * base `id` and returns the id to emit — the base id on first use,
   * `<id>-<n>` on repeats. The one mutable-state method on the context; the
   * map is internal per-render state (the shared tracker in
   * `@/utils/heading-id-tracker`), safe because a context is never shared
   * across renders.
   */
  trackIdAttribute(id: string): string
}

/**
 * Resolves the document factory for one render pass: `options.createDocument`
 * / `options.dom` / the browser global, in that order. This absorbs the
 * deleted `addCreateDocumentOption` helper (plan 040 Step 6) — the options bag
 * is read, never mutated — preserving its exact non-browser throw. The
 * browser-global fallback is covered by the seam tests via stubbed globals.
 */
function resolveCreateDocument(options: ExportDOMOptions): () => Document {
  if (options.createDocument) {
    // A truthy non-function `createDocument` is a caller bug. The pinned
    // TypeError message names the historical caller — the check lived in the
    // markdown renderer (test/nodes-base/nodes/markdown.test.ts pins the exact
    // message) before plan 042 moved it into the factory.
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

  const document = typeof window !== 'undefined' && window.document

  if (!document) {
    throw new Error('Must be passed a `createDocument` function as an option when used in a non-browser environment')
  }

  return function () {
    return document
  }
}

/**
 * The options copied verbatim onto the context (documented at their
 * interface declarations): the pass-through half of the seam. The key list
 * is the single enumeration the factory copies from — a new pass-through
 * option joins the options type, the interface, and this list, and the
 * factory body never changes.
 */
const VERBATIM_OPTION_KEYS = [
  'canTransformImage',
  'canTransformImageToFormat',
  'pictureImageFormats',
  'resolveRenderMeta',
] as const satisfies readonly (keyof ExportDOMOptions)[]

type VerbatimOptions = Pick<RenderContext, (typeof VERBATIM_OPTION_KEYS)[number]>

function pickVerbatimOptions(options: ExportDOMOptions): VerbatimOptions {
  const picked: Record<string, unknown> = {}
  for (const key of VERBATIM_OPTION_KEYS) {
    // the key list is satisfies-checked against ExportDOMOptions, so the
    // untyped write stays inside the seam
    picked[key] = options[key]
  }
  return picked as VerbatimOptions
}

/**
 * The deprecated flat option keys each policy key falls back to when the
 * host's resolver leaves it unanswered — the compatibility forwarding from
 * the pre-seam `ExportDOMOptions` shape.
 */
const LEGACY_POLICY_OPTION_KEYS: Record<ExportPolicyKey, keyof ExportDOMOptions> = {
  'footnotes-section-title': 'footnotesSectionTitle',
  'inkling-version': 'inklingVersion',
}

/**
 * Builds the read-only render context for one render pass.
 */
export function createRenderContext(options: ExportDOMOptions): RenderContext {
  const createDocument = resolveCreateDocument(options)
  // the per-render heading-id dedup state — the shared tracker's map
  // (`@/utils/heading-id-tracker`), not a local one
  const trackIdAttribute = createHeadingIdTracker()

  // The keyed policy seam: the resolver answers first, the deprecated flat
  // keys forward as its fallback, and an unanswered key stays undefined (the
  // consumer's documented default path).
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
  // global, resolved lazily so renders that never sanitize (plain text,
  // headings) pay nothing and a DOM-less environment throws only on first
  // use — the same non-browser error resolveCreateDocument throws eagerly.
  // A createHTMLDocument()'s defaultView is always null, so the window can
  // only come from options.dom, a windowed document, or the global.
  const browserWindow = typeof window !== 'undefined' && window.document ? window : undefined
  let resolvedWindow: ExportDOMDom['window'] | undefined
  const resolveWindow = (): ExportDOMDom['window'] => {
    if (resolvedWindow) {
      return resolvedWindow
    }
    // When the caller passed options.createDocument, sanitize must bind to
    // that factory's own document — options.dom?.window may point at a
    // different document, and binding window B while elements are written to
    // document A breaks the single-document invariant of one render pass. A
    // createHTMLDocument()'s defaultView is always null, so options.dom?.window
    // stays the fallback for factory-made documents without a view.
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
      // is-local-content-image as the old per-call-site forwarding did.
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
      // The ExportDOMDom window is structural; the WindowLike assertion stays
      // inside the seam. One bound instance per context.
      boundDOMPurify ??= DOMPurify(resolveWindow() as unknown as WindowLike)
      return boundDOMPurify.sanitize(html, config)
    },
    trackIdAttribute,
  }

  return Object.freeze(context)
}
