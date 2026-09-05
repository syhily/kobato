import { expect, test, type Page } from '@playwright/test'

import {
  assertHTML,
  createDataTransfer,
  fixture,
  focusEditor,
  html,
  initialize,
  insertCard,
  insertCardWithUpload,
  loadSerializedState,
} from '#/utils/e2e'

test.describe('File card', () => {
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

  test('can import serialized file card nodes', async function () {
    await loadSerializedState(page, {
      root: {
        children: [
          {
            type: 'file',
            src: '/content/images/2022/11/inkling-lexical.jpg',
            fileTitle: 'This is a title',
            fileCaption: 'This is a description',
            fileName: 'inkling-lexical.jpg',
            fileSize: '1.2 MB',
          },
        ],
        direction: null,
        format: '',
        indent: 0,
        type: 'root',
        version: 1,
      },
    })

    // page.pause();
    await assertHTML(
      page,
      html`
        <div data-lexical-decorator="true" contenteditable="false">
          <div data-inkling-card-editing="false" data-inkling-card-selected="false" data-inkling-card="file"></div>
        </div>
      `,
      { ignoreCardContents: true },
    )
  })

  test('renders file card node', async function () {
    const filePath = fixture('print-img.pdf')

    await focusEditor(page)
    const fileChooserPromise = page.waitForEvent('filechooser')
    await insertCard(page, { cardName: 'file' })
    const fileChooser = await fileChooserPromise

    await assertHTML(
      page,
      html`
        <div data-lexical-decorator="true" contenteditable="false">
          <div data-inkling-card-editing="true" data-inkling-card-selected="true" data-inkling-card="file"></div>
        </div>
        <p><br /></p>
      `,
      { ignoreCardContents: true },
    )

    // Close the fileChooser by selecting a file
    // Without this line, fileChooser stays open for subsequent tests
    await fileChooser.setFiles([filePath])
  })

  test('can upload a file', async function () {
    await focusEditor(page)
    await insertCardWithUpload(page, { cardName: 'file', files: fixture('print-img.pdf') })

    await assertHTML(
      page,
      html`
        <div data-lexical-decorator="true" contenteditable="false">
          <div data-inkling-card-editing="true" data-inkling-card-selected="true" data-inkling-card="file"></div>
        </div>
        <p><br /></p>
      `,
      { ignoreCardContents: true },
    ) // TODO: assert on HTML of inner card (not working due to error in prettier)
  })

  test('can upload dropped file', async function () {
    const filePath = fixture('print-img.pdf')

    await focusEditor(page)

    // Open file card and dismiss files chooser to prepare card for file dropping
    await insertCardWithUpload(page, { cardName: 'file', files: [] })

    // Create and dispatch data transfer
    const dataTransfer = await createDataTransfer(page, [
      { filePath, fileName: 'print-img.pdf', fileType: 'application/pdf' },
    ])
    await page.getByTestId('media-placeholder').dispatchEvent('dragover', { dataTransfer })

    // Dragover text should be visible
    await expect(page.locator('[data-inkling-card-drag-text="true"]')).toBeVisible()

    // Drop file
    await page.getByTestId('media-placeholder').dispatchEvent('drop', { dataTransfer })

    // Dragover text should not be visible
    // expect data-inkling-file-card="dataset
    await expect(page.locator('[data-inkling-file-card="dataset"]')).toBeVisible()
  })

  test('file input opens immediately when added via card menu', async function () {
    await focusEditor(page)
    await page.click('[data-inkling-plus-button]')
    await Promise.all([page.waitForEvent('filechooser'), page.click('[data-inkling-card-menu-item="File"]')])
  })

  test('file input opens immediately when added via slash menu', async function () {
    await focusEditor(page)
    await Promise.all([page.waitForEvent('filechooser'), insertCard(page, { cardName: 'file' })])
  })

  test('can edit file card title', async function () {
    await focusEditor(page)
    await insertCardWithUpload(page, { cardName: 'file', files: fixture('print-img.pdf') })
    await page.locator('[data-inkling-file-card="fileTitle"]').fill('Free printable pdf')
    await expect(page.locator('[data-inkling-file-card="fileTitle"]')).toHaveValue('Free printable pdf')
  })

  test('can edit file card description', async function () {
    await focusEditor(page)
    await insertCardWithUpload(page, { cardName: 'file', files: fixture('print-img.pdf') })
    await page.locator('[data-inkling-file-card="fileDescription"]').fill('Enjoy this free download of a puppy pdf')
    await expect(page.locator('[data-inkling-file-card="fileDescription"]')).toHaveValue(
      'Enjoy this free download of a puppy pdf',
    )
  })

  test('can show errors for failed file upload', async function () {
    await focusEditor(page)
    await insertCardWithUpload(page, { cardName: 'file', files: fixture('print-img-fail.pdf') })

    // Errors should be visible in the placeholder
    await expect(page.getByTestId('media-placeholder-errors')).toBeVisible()
  })
})
