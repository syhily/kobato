import { $createLinkNode } from '@lexical/link'
import { $createListItemNode, $createListNode } from '@lexical/list'
import { $createHeadingNode, $createQuoteNode } from '@lexical/rich-text'
import { TableCellNode, TableNode, TableRowNode } from '@lexical/table'
import { $createParagraphNode, $createTextNode, $getRoot, createEditor } from 'lexical'
/**
 * Demo-content regenerator — skipped in the suite; run manually with:
 *
 *   GENERATE_DEMO_CONTENT=1 pnpm vitest run test/utils/gen-demo-content.test.ts
 *
 * Builds the showcase document through the real node factories so the
 * serialized shapes are guaranteed valid, and writes demo/content/content.json.
 */
import { writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { updateEditor } from '#/utils/test-editor'
import { $createAudioNode } from '@/nodes/AudioNode'
import { $createBookmarkNode } from '@/nodes/BookmarkNode'
import { $createButtonNode } from '@/nodes/ButtonNode'
import { $createCalloutNode } from '@/nodes/CalloutNode'
import { $createCodeBlockNode } from '@/nodes/CodeBlockNode'
import DEFAULT_NODES from '@/nodes/DefaultNodes'
import { $createFileNode } from '@/nodes/FileNode'
import { $createFootnoteRefNode } from '@/nodes/footnote/FootnoteRefNode'
import { $createFootnoteDefinitionNode } from '@/nodes/FootnoteDefinitionNode'
import { $createGalleryNode } from '@/nodes/GalleryNode'
import { $createHeaderNode } from '@/nodes/HeaderNode'
import { $createHorizontalRuleNode } from '@/nodes/HorizontalRuleNode'
import { $createHtmlNode } from '@/nodes/HtmlNode'
import { $createImageNode } from '@/nodes/ImageNode'
import { $createMathNode } from '@/nodes/MathNode'
import { $createToggleNode } from '@/nodes/ToggleNode'
import { $createVideoNode } from '@/nodes/VideoNode'

import { musicPlayer } from '../../demo/components/MusicPlayerCard'

describe('gen-demo-content', () => {
  it.skipIf(!process.env.GENERATE_DEMO_CONTENT)('writes demo/content/content.json', async () => {
    const editor = createEditor({
      namespace: 'gen',
      nodes: [...DEFAULT_NODES, musicPlayer.node],
      onError: (e) => {
        throw e
      },
    })

    await updateEditor(editor, () => {
      const root = $getRoot()

      const h1 = $createHeadingNode('h1')
      h1.append($createTextNode('Every feature, one document'))
      root.append(h1)

      const intro = $createParagraphNode()
      const bold = $createTextNode('This document exercises the full surface: ')
      bold.setFormat('bold')
      const italic = $createTextNode('every card, ')
      italic.setFormat('italic')
      const code = $createTextNode('every plugin, ')
      code.setFormat('code')
      const highlight = $createTextNode('every shortcut')
      highlight.setFormat('highlight')
      intro.append(bold, italic, code, highlight, $createTextNode('.'))
      root.append(intro)

      const withLink = $createParagraphNode()
      withLink.append(
        $createTextNode('Inline link: '),
        $createLinkNode('https://inkling.local/').append($createTextNode('the Inkling platform')),
        $createTextNode(', a footnote ref'),
      )
      withLink.append($createFootnoteRefNode('1', 'demo-footnote-1'), $createTextNode(', and more below.'))
      root.append(withLink)

      const list = $createListNode('bullet')
      for (const item of [
        'Slash menu (/)',
        'Plus button (hover the left gutter)',
        'Markdown shortcuts (##, ```, ---)',
      ]) {
        const li = $createListItemNode()
        li.append($createTextNode(item))
        list.append(li)
      }
      root.append(list)

      const quote = $createQuoteNode()
      quote.append($createTextNode('Quote blocks cycle quote → aside → paragraph with the toolbar button.'))
      root.append(quote)

      root.append(
        $createToggleNode({
          heading: '<p>Toggle title — click to expand</p>',
          content: '<p>Hidden toggle content with its own nested editor.</p>',
        }),
      )

      root.append(
        $createCalloutNode({ calloutEmoji: '💡', calloutText: '<p>Callouts carry an emoji and rich text.</p>' }),
      )

      root.append(
        $createHeaderNode({
          header: '<p>Header card</p>',
          subheader: '<p>With a subheader, alignment and button options in settings.</p>',
          buttonEnabled: true,
          buttonText: 'Read more',
          buttonUrl: 'https://inkling.local/',
        }),
      )

      root.append(
        $createImageNode({
          src: '/inkling-editor-1.png',
          width: 1480,
          height: 486,
          alt: 'Inkling editor, light theme',
          caption: '<p>Image card with a caption editor.</p>',
        }),
      )

      root.append(
        $createGalleryNode({
          images: [
            { src: '/inkling-editor-1.png', width: 1480, height: 486 },
            { src: '/inkling-editor-2.png', width: 1480, height: 486 },
          ],
          caption: '<p>Gallery card — drag images to reorder, drop more in.</p>',
        }),
      )

      // upload-placeholder states: the upload flow is the thing to test
      root.append($createVideoNode({}))
      root.append($createAudioNode({}))
      root.append($createFileNode({}))

      root.append($createBookmarkNode({ url: 'https://inkling.local/' }))
      root.append($createButtonNode({ buttonText: 'Button card', buttonUrl: 'https://inkling.local/' }))
      root.append(
        $createCodeBlockNode({
          code: "import { createEditor } from 'lexical'\n\n// code blocks keep language + optional caption\nconst editor = createEditor()",
          language: 'ts',
          caption: '<p>main.ts</p>',
        }),
      )
      root.append(
        $createHtmlNode({
          html: '<div style="padding: 12px; border: 1px solid currentColor;">HTML card renders raw markup in an editable sandbox.</div>',
        }),
      )
      root.append($createMathNode({ tex: 'e^{i\\pi} + 1 = 0' }))
      root.append($createHorizontalRuleNode())

      // 3×3 table with header row (the insert default)
      const table = new TableNode()
      const headerRow = new TableRowNode()
      for (const label of ['Feature', 'Where', 'How to trigger']) {
        const cell = new TableCellNode(1) // header state
        const p = $createParagraphNode()
        p.append($createTextNode(label))
        cell.append(p)
        headerRow.append(cell)
      }
      table.append(headerRow)
      for (const row of [
        ['Slash menu', 'cards', 'Type /'],
        ['Table', 'element family', 'Slash menu → Table'],
      ]) {
        const tableRow = new TableRowNode()
        for (const text of row) {
          const cell = new TableCellNode(0)
          const p = $createParagraphNode()
          p.append($createTextNode(text))
          cell.append(p)
          tableRow.append(cell)
        }
        table.append(tableRow)
      }
      root.append(table)

      root.append(new musicPlayer.node({ src: '' }))

      root.append(
        $createFootnoteDefinitionNode({
          targetKey: 'demo-footnote-1',
          content: '<p>The demo footnote: refs renumber in citation order.</p>',
        }),
      )

      root.append($createParagraphNode())
    })

    const state = editor.getEditorState().toJSON()
    writeFileSync('demo/content/content.json', `${JSON.stringify(state, null, 2)}\n`)
    expect(state.root.children.length).toBeGreaterThan(15)
  })
})
