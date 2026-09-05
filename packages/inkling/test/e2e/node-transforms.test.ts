import { test, type Page } from '@playwright/test'

import { assertHTML, html, initialize } from '#/utils/e2e'

test.describe('Node transforms', () => {
  let page: Page
  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage()
  })

  test.beforeEach(async () => {
    await initialize({ page })
  })

  test.afterAll(async () => {
    await page.close()
  })

  test('nested elements in paragraph nodes 1', async function () {
    await page.evaluate(() => {
      function isLexicalEditor(value: unknown): value is {
        parseEditorState: (serializedState: string) => unknown
        setEditorState: (editorState: unknown) => void
      } {
        return (
          typeof value === 'object' &&
          value !== null &&
          'parseEditorState' in value &&
          typeof value.parseEditorState === 'function' &&
          'setEditorState' in value &&
          typeof value.setEditorState === 'function'
        )
      }

      const serializedState = JSON.stringify({
        root: {
          children: [
            {
              children: [
                {
                  children: [
                    {
                      detail: 0,
                      format: 0,
                      mode: 'normal',
                      style: '',
                      text: 'Hello Fintech Friends,',
                      type: 'text',
                      version: 1,
                    },
                  ],
                  direction: 'ltr',
                  format: '',
                  indent: 0,
                  type: 'paragraph',
                  version: 1,
                },
                {
                  type: 'horizontalrule',
                  version: 1,
                },
              ],
              direction: 'ltr',
              format: '',
              indent: 0,
              type: 'paragraph',
              version: 1,
            },
          ],
          direction: 'ltr',
          format: '',
          indent: 0,
          type: 'root',
          version: 1,
        },
      })
      const candidate = 'lexicalEditor' in window ? window.lexicalEditor : undefined
      if (!isLexicalEditor(candidate)) {
        throw new Error('Expected the demo to expose a Lexical editor')
      }

      const editor = candidate
      const editorState = editor.parseEditorState(serializedState)
      editor.setEditorState(editorState)
    })
    await assertHTML(
      page,
      html`
        <p dir="ltr"><span data-lexical-text="true">Hello Fintech Friends,</span></p>
        <div data-lexical-decorator="true" contenteditable="false">
          <div
            data-inkling-card-editing="false"
            data-inkling-card-selected="false"
            data-inkling-card="horizontalrule"
          ></div>
        </div>
      `,
      { ignoreCardContents: true },
    )
  })

  test('nested elements in paragraph nodes 2', async function () {
    await page.evaluate(() => {
      function isLexicalEditor(value: unknown): value is {
        parseEditorState: (serializedState: string) => unknown
        setEditorState: (editorState: unknown) => void
      } {
        return (
          typeof value === 'object' &&
          value !== null &&
          'parseEditorState' in value &&
          typeof value.parseEditorState === 'function' &&
          'setEditorState' in value &&
          typeof value.setEditorState === 'function'
        )
      }

      const serializedState = JSON.stringify({
        root: {
          children: [
            {
              children: [
                {
                  detail: 0,
                  format: 0,
                  mode: 'normal',
                  style: '',
                  text: 'Hello Fintech Friends,',
                  type: 'text',
                  version: 1,
                },
              ],
              direction: 'ltr',
              format: '',
              indent: 0,
              type: 'paragraph',
              version: 1,
            },
            {
              children: [
                {
                  children: [],
                  direction: 'ltr',
                  format: '',
                  indent: 0,
                  type: 'paragraph',
                  version: 1,
                },
                {
                  type: 'horizontalrule',
                  version: 1,
                },
              ],
              direction: 'ltr',
              format: '',
              indent: 0,
              type: 'paragraph',
              version: 1,
            },
          ],
          direction: 'ltr',
          format: '',
          indent: 0,
          type: 'root',
          version: 1,
        },
      })
      const candidate = 'lexicalEditor' in window ? window.lexicalEditor : undefined
      if (!isLexicalEditor(candidate)) {
        throw new Error('Expected the demo to expose a Lexical editor')
      }

      const editor = candidate
      const editorState = editor.parseEditorState(serializedState)
      editor.setEditorState(editorState)
    })
    await assertHTML(
      page,
      html`
        <p dir="ltr"><span data-lexical-text="true">Hello Fintech Friends,</span></p>
        <p><br /></p>
        <div data-lexical-decorator="true" contenteditable="false">
          <div
            data-inkling-card-editing="false"
            data-inkling-card-selected="false"
            data-inkling-card="horizontalrule"
          ></div>
        </div>
      `,
      { ignoreCardContents: true },
    )
  })
})
