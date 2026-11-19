import type { ExportDOMDom } from '@kobato/inkling-internal/nodes/base'
import type { CreateEditorArgs, SerializedEditorState } from 'lexical'

import { createHeadlessHtmlEditor } from '@kobato/inkling-internal/html/headless-editor'
import { $insertHtmlDocument } from '@kobato/inkling-internal/html/html-to-lexical/insert-html'
import { registerDefaultTransforms, type DefaultTransformsOptions } from '@kobato/inkling-internal/transforms'
import { MINIMAL_DOCUMENT } from '@kobato/inkling-internal/utils/initial-document'

export interface htmlToLexicalOptions {
  dom: ExportDOMDom
  editorConfig?: CreateEditorArgs
  alignment?: DefaultTransformsOptions['alignment']
}

/* c8 ignore next -- V8 creates a phantom branch for the export */
export function htmlToLexical(html: string, options: htmlToLexicalOptions): SerializedEditorState {
  // `html` is typed as required, but hosts do pass null — the null-tolerance
  // is a tested contract
  if (!html?.trim()) {
    return MINIMAL_DOCUMENT
  }

  // The importer replaces the defaults wholesale when the caller passes
  // editorConfig.nodes; the renderer uses additive semantics instead (see
  // @kobato/inkling-internal/html/headless-editor) — do not "unify" the two.
  const editor = createHeadlessHtmlEditor({ merge: 'wholesale', editorConfig: options.editorConfig })

  const doc = options.dom.window.document.implementation.createHTMLDocument('')
  doc.body.innerHTML = html.trim()

  registerDefaultTransforms(editor, { alignment: options.alignment })
  editor.update(
    () => {
      $insertHtmlDocument(editor, doc)
    },
    { discrete: true },
  )

  const editorState = editor.getEditorState()

  return editorState.toJSON()
}
