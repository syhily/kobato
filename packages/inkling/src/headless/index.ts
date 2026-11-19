export type { EditorState, SerializedEditorState } from 'lexical'

export {
  DEFAULT_HTML_NODES,
  htmlToLexicalState,
  lexicalStateToHtml,
  lexicalStateToPlainText,
} from '@kobato/inkling-internal/html/headless-html'
export type {
  HtmlToLexicalStateOptions,
  LexicalStateToHtmlOptions,
  LexicalStateToPlainTextOptions,
} from '@kobato/inkling-internal/html/headless-html'

export { createHeadingIdTracker } from '@kobato/inkling-internal/utils/heading-id-tracker'
export { slugify } from '@kobato/inkling-internal/utils/slugify'

export type { ExportDOMDom } from '@kobato/inkling-internal/nodes/base'
export { generateDecoratorNode } from '@kobato/inkling-internal/nodes/base/generate-decorator-node'
export type { DecoratorNodeProperty } from '@kobato/inkling-internal/nodes/base/card-specs'

export type { CardImportSpec } from '@kobato/inkling-internal/nodes/base/import-spec'
export { lexicalStateToMarkdown, markdownToLexicalState } from '@kobato/inkling-internal/markdown/round-trip'
export type { MarkdownRoundTripOptions } from '@kobato/inkling-internal/markdown/round-trip'
export type { HostCard } from '@kobato/inkling-internal/nodes/cards/host-cards'
