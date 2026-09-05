import { JSDOM } from 'jsdom'
import { createEditor } from 'lexical'

import type { ExportDOMOptions } from '@/nodes/base/export-dom'

import { lexicalStateToHtml } from '@/html/headless-html'
import $convertToHtmlString from '@/html/renderer/convert-to-html-string'
import DEFAULT_NODES from '@/nodes/DefaultNodes'
import defaultTheme from '@/themes/default'

// The HTML render harness — the one home of the two render paths the suite
// pins against, each previously hand-copied per spec:
//
// - renderLive: an editor configured like InklingComposer (DEFAULT_NODES +
//   defaultTheme), a parsed state, $convertToHtmlString.
// - renderHeadless: the headless route through the public seam
//   (lexicalStateToHtml), so the default headless node set carries the
//   family under test.
//
// createTestDom is the suite's single jsdom construction site (jsdom is
// the pinned optional peer).

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
