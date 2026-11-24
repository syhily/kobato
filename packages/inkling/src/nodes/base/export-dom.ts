import type { DOMExportOutput as LexicalDOMExportOutput, LexicalEditor } from 'lexical'

export type ExportDOMOutputType = 'inner' | 'outer' | 'value'
export type ExportDOMElement = LexicalDOMExportOutput['element']

export type ExportDOMOutput<TType extends ExportDOMOutputType = ExportDOMOutputType> = LexicalDOMExportOutput & {
  type: TType
}

export interface ExportDOMDom {
  window: { document: Document }
}

export type ExportPolicyKey = 'inkling-version' | 'footnotes-section-title'

export interface InlineMarkupExporter {
  exportDOM(editor: LexicalEditor, options?: ExportDOMOptions): LexicalDOMExportOutput | ExportDOMOutput
}

export interface InlineMarkupTextEntity extends InlineMarkupExporter {
  isInlineMarkupEntity(): boolean
}

export interface ImageOptimizationOptions {
  defaultMaxWidth?: number
  contentImageSizes?: Record<string, { width: number }>
  srcsets?: boolean
}

export interface ExportDOMOptions {
  createDocument?: () => Document
  dom?: ExportDOMDom
  siteUrl?: string
  imageBaseUrl?: string
  canTransformImage?: (src: string) => boolean
  canTransformImageToFormat?: (format: string) => boolean
  imageOptimization?: ImageOptimizationOptions
  /** @deprecated */
  inklingVersion?: string
  pictureImageFormats?: boolean
  /** @deprecated */
  footnotesSectionTitle?: string
  resolveExportPolicy?: (key: ExportPolicyKey) => string | undefined
  resolveRenderMeta?: (kind: string, id: string) => unknown
}
