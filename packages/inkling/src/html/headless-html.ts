import type { ExportDOMDom, ExportDOMOptions } from '@kobato/inkling-internal/nodes/base'
import type { CreateEditorArgs, LexicalNodeConfig, SerializedEditorState } from 'lexical'

import { resolveHeadlessDom } from '@kobato/inkling-internal/html/headless-dom'
import { prepareHeadlessRenderEditor } from '@kobato/inkling-internal/html/headless-editor'
import { htmlToLexical } from '@kobato/inkling-internal/html/html-to-lexical/index'
import $convertToHtmlString from '@kobato/inkling-internal/html/renderer/convert-to-html-string'
import { registerLoadedPasteDialect } from '@kobato/inkling-internal/markdown/lazy-paste-dialect'
import { pasteDialect } from '@kobato/inkling-internal/markdown/paste-dialect'
import { type DefaultTransformsOptions } from '@kobato/inkling-internal/transforms'
import { $getRoot } from 'lexical'

registerLoadedPasteDialect({ pasteDialect })

export { DEFAULT_HTML_NODES } from '@kobato/inkling-internal/html/default-html-nodes'

export interface LexicalStateToHtmlOptions extends ExportDOMOptions {
  nodes?: LexicalNodeConfig[]
  onError?: (error: Error) => void
}

export async function lexicalStateToHtml(
  state: SerializedEditorState | string,
  options?: LexicalStateToHtmlOptions,
): Promise<string> {
  const { nodes, onError, ...renderOptions } = options ?? {}
  const dom = await resolveHeadlessDom(renderOptions.dom)

  const editor = prepareHeadlessRenderEditor(state, { nodes, onError })

  let html = ''
  editor.update(() => {
    html = $convertToHtmlString(editor, { ...renderOptions, dom })
  })

  return html
}

export interface HtmlToLexicalStateOptions {
  editorConfig?: CreateEditorArgs

  dom?: ExportDOMDom

  alignment?: DefaultTransformsOptions['alignment']
}

export async function htmlToLexicalState(
  html: string,
  options?: HtmlToLexicalStateOptions,
): Promise<SerializedEditorState> {
  const dom = await resolveHeadlessDom(options?.dom)
  return htmlToLexical(html, { dom, editorConfig: options?.editorConfig, alignment: options?.alignment })
}
export interface LexicalStateToPlainTextOptions {
  nodes?: LexicalNodeConfig[]

  onError?: (error: Error) => void
}

export function lexicalStateToPlainText(
  state: SerializedEditorState | string,
  options?: LexicalStateToPlainTextOptions,
): string {
  const editor = prepareHeadlessRenderEditor(state, {
    nodes: options?.nodes,
    onError: options?.onError,
  })

  let text = ''
  editor.update(() => {
    text = $getRoot().getTextContent()
  })
  return text.trimEnd()
}
