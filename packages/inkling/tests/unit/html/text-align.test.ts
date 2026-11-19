import { htmlToLexicalState } from '@kobato/inkling-internal/html/headless-html'
import DEFAULT_NODES from '@kobato/inkling-internal/nodes/DefaultNodes'
import { $setBlocksAlignment, type BlockAlignment } from '@kobato/inkling-internal/plugins/behaviour/format-toolbar'
import defaultTheme from '@kobato/inkling-internal/themes/default'
import { registerDefaultTransforms } from '@kobato/inkling-internal/transforms'
import { htmlToLexical } from '@kobato/inkling/tests/utils/html-to-lexical-with-dom'
import { renderHeadless, renderLive } from '@kobato/inkling/tests/utils/render-live'
import { tick, updateEditor } from '@kobato/inkling/tests/utils/test-editor'
import { $createParagraphNode, $createTextNode, $getRoot, createEditor } from 'lexical'
import { describe, expect, it } from 'vitest'

interface BlockJSON {
  type: string
  format?: string
  children?: BlockJSON[]
  [key: string]: unknown
}

async function editAlignedParagraph(
  alignment: 'strip' | 'keep',
  format: BlockAlignment | '',
): Promise<{ root: { children: BlockJSON[] } }> {
  const editor = createEditor({
    namespace: 'test',
    nodes: DEFAULT_NODES,
    theme: defaultTheme,
    onError: (error) => {
      throw error
    },
  })
  registerDefaultTransforms(editor, { alignment })
  await updateEditor(editor, () => {
    const paragraph = $createParagraphNode()
    paragraph.append($createTextNode('hello'))
    $getRoot().append(paragraph)
    paragraph.selectStart()
  })
  if (format !== '') {
    $setBlocksAlignment(editor, format)
    await tick()
  }
  return editor.getEditorState().toJSON() as unknown as { root: { children: BlockJSON[] } }
}

const alignedState = (type: string, format: string, children: unknown[], extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    root: {
      children: [
        {
          type,
          version: 1,
          format,
          indent: 0,
          direction: 'ltr',
          children,
          ...extra,
        },
      ],
      direction: 'ltr',
      format: '',
      indent: 0,
      type: 'root',
      version: 1,
    },
  })

const text = (content: string) => ({
  type: 'text',
  version: 1,
  detail: 0,
  format: 0,
  mode: 'normal',
  style: '',
  text: content,
})

describe('text-align: the editing → serialization leg', () => {
  it('keeps the surgery format in exportJSON when the surface keeps alignment', async () => {
    const json = await editAlignedParagraph('keep', 'center')
    expect(json.root.children[0].format).toBe('center')
  })

  it('strips the surgery format on surfaces without alignment (the default transform policy)', async () => {
    const json = await editAlignedParagraph('strip', 'center')
    expect(json.root.children[0].format).toBe('')
  })

  it('leaves the no-alignment default untouched', async () => {
    const json = await editAlignedParagraph('keep', '')
    expect(json.root.children[0].format).toBe('')
  })
})

describe('text-align: serialization → HTML export → HTML import round trip', () => {
  const cases: { name: string; state: string; html: string; format: string }[] = [
    ...(['left', 'center', 'right'] as const).map((alignment) => ({
      name: `paragraph ${alignment}`,
      state: alignedState('paragraph', alignment, [text('hello')]),
      html: `<p style="text-align: ${alignment}">hello</p>`,
      format: alignment,
    })),
    {
      name: 'paragraph default (no alignment)',
      state: alignedState('paragraph', '', [text('hello')]),
      html: '<p>hello</p>',
      format: '',
    },
    {
      name: 'heading center',
      state: alignedState('extended-heading', 'center', [text('hello')], { tag: 'h2' }),
      html: '<h2 id="hello" style="text-align: center">hello</h2>',
      format: 'center',
    },
    {
      name: 'quote right',
      state: alignedState('extended-quote', 'right', [text('quoted')]),
      html: '<blockquote style="text-align: right">quoted</blockquote>',
      format: 'right',
    },
  ]

  for (const { name, state, html, format } of cases) {
    it(`${name}: survives both export paths and the keep-import, byte-exact on re-export`, async () => {
      expect(renderLive(state)).toBe(html)
      await expect(renderHeadless(state)).resolves.toBe(html)

      const imported = htmlToLexical(html, {
        alignment: 'keep',
        editorConfig: {
          onError(error) {
            throw error
          },
        },
      }) as unknown as { root: { children: BlockJSON[] } }
      expect(imported.root.children[0].format).toBe(format)

      expect(renderLive(JSON.stringify(imported))).toBe(html)
    })
  }

  it('the default strip-import drops alignment (surfaces without alignment UI)', () => {
    const imported = htmlToLexical('<p style="text-align: center">hello</p>', {
      editorConfig: {
        onError(error) {
          throw error
        },
      },
    }) as unknown as { root: { children: BlockJSON[] } }
    expect(imported.root.children[0].format).toBe('')
  })

  it('the headless public surface forwards the keep option (quote import reads text-align)', async () => {
    const imported = (await htmlToLexicalState('<blockquote style="text-align: left">quoted</blockquote>', {
      alignment: 'keep',
    })) as unknown as { root: { children: BlockJSON[] } }
    expect(imported.root.children[0].format).toBe('left')
  })
})
