import { JSDOM } from 'jsdom'
import { createEditor } from 'lexical'

import type { ExportDOMOptions } from '@/inkling/nodes/base/export-dom'

import { lexicalStateToHtml } from '@/inkling/html/headless-html'
import $convertToHtmlString from '@/inkling/html/renderer/convert-to-html-string'
import DEFAULT_NODES from '@/inkling/nodes/DefaultNodes'
import defaultTheme from '@/inkling/themes/default'

// The HTML render harness: the two render paths the suite pins against, plus
// the single jsdom construction site (jsdom is the pinned optional peer).

/** The suite's single jsdom construction site — pass a document string when the test needs one. */
export function createTestDom(html?: string): JSDOM {
  return new JSDOM(html)
}

/** The live render path: an editor configured like InklingComposer, a parsed state, $convertToHtmlString. */
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

/** The headless route through the public seam — a fresh DOM per render. */
export async function renderHeadless(serializedState: string): Promise<string> {
  return lexicalStateToHtml(serializedState, {
    dom: createTestDom(),
    onError(error) {
      throw error
    },
  })
}
