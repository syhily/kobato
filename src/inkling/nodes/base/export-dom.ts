import type { DOMExportOutput as LexicalDOMExportOutput, LexicalEditor } from 'lexical'

export type ExportDOMOutputType = 'inner' | 'outer' | 'value'
export type ExportDOMElement = LexicalDOMExportOutput['element']

export type ExportDOMOutput<TType extends ExportDOMOutputType = ExportDOMOutputType> = LexicalDOMExportOutput & {
  type: TType
}

export interface ExportDOMDom {
  window: { document: Document }
}

/**
 * Keyed export-policy kinds resolved through `ExportDOMOptions.resolveExportPolicy`;
 * each key names one policy with exactly one consumer.
 */
export type ExportPolicyKey = 'inkling-version' | 'footnotes-section-title'

/**
 * The two-parameter `exportDOM` inline markup exporters declare: they need the
 * options bag so headless renders resolve their DOM. An interface (not a type)
 * so the string layer's narrowing reaches the exporter without an assertion.
 */
export interface InlineMarkupExporter {
  exportDOM(editor: LexicalEditor, options?: ExportDOMOptions): LexicalDOMExportOutput | ExportDOMOutput
}

/**
 * Opt-in protocol for a TextNode entity whose `exportDOM` markup the string
 * layer splices into the text flow instead of the pending text run.
 */
export interface InlineMarkupTextEntity extends InlineMarkupExporter {
  isInlineMarkupEntity(): boolean
}

/**
 * Image-optimization keys consumed by the image/gallery renderers and the
 * srcset helper. The render-context factory validates the known keys into a
 * frozen snapshot; the type is closed so in-repo callers get typo-checking.
 */
export interface ImageOptimizationOptions {
  defaultMaxWidth?: number
  contentImageSizes?: Record<string, { width: number }>
  srcsets?: boolean
}

/**
 * The public export-options input type: the typed fields only, no open bag. An
 * unknown option name fails typecheck instead of being silently ignored.
 */
export interface ExportDOMOptions {
  createDocument?: () => Document
  dom?: ExportDOMDom
  siteUrl?: string
  imageBaseUrl?: string
  canTransformImage?: (src: string) => boolean
  canTransformImageToFormat?: (format: string) => boolean
  imageOptimization?: ImageOptimizationOptions
  /**
   * @deprecated Resolve `'inkling-version'` through `resolveExportPolicy`
   * instead. Still honored as the fallback when the resolver leaves the key
   * unanswered.
   */
  inklingVersion?: string
  /** image renderer: emit `<picture>` sources for modern formats */
  pictureImageFormats?: boolean
  /**
   * @deprecated Resolve `'footnotes-section-title'` through
   * `resolveExportPolicy` instead. Still honored as the fallback when the
   * resolver leaves the key unanswered.
   */
  footnotesSectionTitle?: string
  /**
   * Keyed export-policy resolution, `resolveRenderMeta`-style: the host answers
   * the `ExportPolicyKey`s it cares about and leaves the rest unanswered
   * (undefined falls back to the deprecated flat key, then the subsystem
   * default). The resolver wins over the flat keys.
   */
  resolveExportPolicy?: (key: ExportPolicyKey) => string | undefined
  /**
   * Request-scoped render-time meta: a card renderer resolves host enrichment
   * data by (kind, id) and falls back to its placeholder when unresolved.
   * Synchronous by contract — exportDOM is a sync pipeline — and never
   * persisted on the node.
   */
  resolveRenderMeta?: (kind: string, id: string) => unknown
}
