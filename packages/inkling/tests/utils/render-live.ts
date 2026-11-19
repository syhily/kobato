import type { ExportDOMOptions } from '@kobato/inkling-internal/nodes/base/export-dom'

import { lexicalStateToHtml } from '@kobato/inkling-internal/html/headless-html'
import $convertToHtmlString from '@kobato/inkling-internal/html/renderer/convert-to-html-string'
import DEFAULT_NODES from '@kobato/inkling-internal/nodes/DefaultNodes'
import defaultTheme from '@kobato/inkling-internal/themes/default'
import { JSDOM } from 'jsdom'
import { createEditor } from 'lexical'

export function createTestDom(html?: string): JSDOM {
  return new JSDOM(html)
}

export function renderLive(serializedState: string, options?: ExportDOMOptions): string {
  const editor = createEditor({
    namespace: 'test',
    nodes: DEFAULT_NODES,
    theme: defaultTheme,
    onError: (error) => {
      throw error
    },
  })
  editor.setEditorState(editor.parseEditorState(serializedState))

  let html = ''
  editor.read(() => {
    html = $convertToHtmlString(editor, options)
  })
  return html
}

export async function renderHeadless(serializedState: string): Promise<string> {
  return lexicalStateToHtml(serializedState, {
    dom: createTestDom(),
    onError(error) {
      throw error
    },
  })
}
