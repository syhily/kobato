/**
 * Clean-consumer type fixture for the published @inkling/editor/headless
 * declaration.
 *
 * This file is installed into isolated temp projects in
 * scripts/verify-packed-types.ts and type-checked against the packed tarball
 * only — it must not import from workspace aliases or undocumented paths.
 */
import {
  DEFAULT_HTML_NODES,
  type EditorState,
  type ExportDOMDom,
  type HostCard,
  type HtmlToLexicalStateOptions,
  htmlToLexicalState,
  // @ts-expect-error - InklingEditor is not part of the react-free headless entry
  InklingEditor,
  type LexicalStateToHtmlOptions,
  type LexicalStateToPlainTextOptions,
  lexicalStateToHtml,
  lexicalStateToMarkdown,
  lexicalStateToPlainText,
  type MarkdownRoundTripOptions,
  markdownToLexicalState,
  type SerializedEditorState,
} from '@inkling/editor/headless'

declare const serializedState: SerializedEditorState
declare const editorState: EditorState

// --- positive cases ---------------------------------------------------------

const nodes = [...DEFAULT_HTML_NODES]
void nodes

const htmlOptions: LexicalStateToHtmlOptions = {}
const importOptions: HtmlToLexicalStateOptions = {}
const plainTextOptions: LexicalStateToPlainTextOptions = {}
void htmlOptions
void importOptions
void plainTextOptions

const htmlPromise: Promise<string> = lexicalStateToHtml(serializedState)
const statePromise: Promise<SerializedEditorState> = htmlToLexicalState('<p>hi</p>')
const plainText: string = lexicalStateToPlainText(serializedState)
void htmlPromise
void statePromise
void plainText

const hostCard: HostCard | undefined = undefined
const markdownOptions: MarkdownRoundTripOptions = { cards: hostCard ? [hostCard] : [] }
const markdown: string = lexicalStateToMarkdown(serializedState, markdownOptions)
const markdownState: SerializedEditorState = markdownToLexicalState('# hi')
void markdown
void markdownState

const dom: ExportDOMDom | undefined = undefined
void dom

// --- negative cases ---------------------------------------------------------

void InklingEditor
