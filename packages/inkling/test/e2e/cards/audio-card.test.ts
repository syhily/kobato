import { expect, test, type Page } from '@playwright/test'

import {
  assertHTML,
  createDataTransfer,
  createSnippet,
  fixture,
  focusEditor,
  html,
  initialize,
  insertCard,
  insertCardWithUpload,
  loadSerializedState,
} from '#/utils/e2e'

test.describe('Audio card', () => {
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

  test('can import serialized audio card nodes', async function () {
    await loadSerializedState(page, {
      root: {
        children: [
          {
            type: 'audio',
            src: '/content/images/2022/11/inkling-lexical.jpg',
            title: 'This is a title',
            duration: '',
            mimeType: 'audio/mp3',
            thumbnailSrc: '/content/images/2022/12/inkling-lexical.png',
          },
        ],
        direction: null,
        format: '',
        indent: 0,
        type: 'root',
        version: 1,
      },
    })

    await assertHTML(
      page,
      html`
        <div data-lexical-decorator="true" contenteditable="false">
          <div data-inkling-card-editing="false" data-inkling-card-selected="false" data-inkling-card="audio"></div>
        </div>
      `,
      { ignoreCardContents: true },
    )
  })

  test('renders audio card node', async function () {
    const filePath = fixture('audio-sample.mp3')

    await focusEditor(page)
    const fileChooserPromise = page.waitForEvent('filechooser')
    await insertCard(page, { cardName: 'audio' })
    const fileChooser = await fileChooserPromise

    await assertHTML(
      page,
      html`
        <div data-lexical-decorator="true" contenteditable="false">
          <div data-inkling-card-editing="true" data-inkling-card-selected="true" data-inkling-card="audio"></div>
        </div>
        <p><br /></p>
      `,
      { ignoreCardContents: true },
    )

    // Close the fileChooser by selecting a file
    // Without this line, fileChooser stays open for subsequent tests
    await fileChooser.setFiles([filePath])
  })

  test('can upload an audio file', async function () {
    await focusEditor(page)
    await insertCardWithUpload(page, { cardName: 'audio', files: fixture('audio-sample.mp3') })

    // Check that audio file was uploaded
    await expect(page.getByTestId('audio-title')).toBeVisible()
    expect(await page.getByTestId('audio-title').inputValue()).toEqual('Audio sample')

    await assertHTML(
      page,
      html`
        <div data-lexical-decorator="true" contenteditable="false">
          <div data-inkling-card-editing="true" data-inkling-card-selected="true" data-inkling-card="audio"></div>
        </div>
        <p><br /></p>
      `,
      { ignoreCardContents: true },
    ) // TODO: assert on HTML of inner card (not working due to error in prettier)
  })

  test('can upload dropped audio', async function () {
    const filePath = fixture('audio-sample.mp3')

    await focusEditor(page)

    // Open audio card and dismiss files chooser to prepare card for audio dropping
    await insertCardWithUpload(page, { cardName: 'audio', files: [] })

    // Create and dispatch data transfer
    const dataTransfer = await createDataTransfer(page, [
      { filePath, fileName: 'audio-sample.mp3', fileType: 'audio/mp3' },
    ])
    await page.getByTestId('media-placeholder').dispatchEvent('dragover', { dataTransfer })

    // Dragover text should be visible
    await expect(page.locator('[data-inkling-card-drag-text="true"]')).toBeVisible()

    // Drop file
    await page.getByTestId('media-placeholder').dispatchEvent('drop', { dataTransfer })

    // Check that audio file was uploaded
    await expect(page.getByTestId('media-duration')).toContainText('0:19')
  })

  test('shows errors on failed audio upload', async function () {
    await focusEditor(page)
    await insertCardWithUpload(page, { cardName: 'audio', files: fixture('audio-sample-fail.mp3') })

    // Check that errors are displayed
    await page.waitForSelector('[data-testid="audio-upload-errors"]')
    await expect(page.getByTestId('audio-upload-errors')).toBeVisible()
  })

  test('can show errors if was dropped a file with wrong extension to audio placeholder', async function () {
    const filePath = fixture('large-image.png')

    await focusEditor(page)

    // Open audio card and dismiss files chooser to prepare card for audio dropping
    await insertCardWithUpload(page, { cardName: 'audio', files: [] })

    // Create and dispatch data transfer
    const dataTransfer = await createDataTransfer(page, [
      { filePath, fileName: 'large-image.png', fileType: 'image/png' },
    ])
    await page.getByTestId('media-placeholder').dispatchEvent('drop', { dataTransfer })

    // Errors should be visible
    await expect(page.getByTestId('audio-upload-errors')).toBeVisible()
  })

  test('file input opens immediately when added via card menu', async function () {
    await focusEditor(page)
    await page.click('[data-inkling-plus-button]')
    // waitForEvent rejects on timeout, so its resolution is the assertion
    await Promise.all([page.waitForEvent('filechooser'), page.click('[data-inkling-card-menu-item="Audio"]')])
  })

  test('file input opens immediately when added via slash menu', async function () {
    await focusEditor(page)
    // waitForEvent rejects on timeout, so its resolution is the assertion
    await Promise.all([page.waitForEvent('filechooser'), insertCard(page, { cardName: 'audio' })])
  })

  test('can change the title of the audio card', async function () {
    await focusEditor(page)
    await insertCardWithUpload(page, { cardName: 'audio', files: fixture('audio-sample.mp3') })

    // Change title
    await expect(page.getByTestId('audio-title')).toBeVisible()
    await page.getByTestId('audio-title').click()
    await page.keyboard.type(' 1')

    // Check that title updated
    expect(await page.getByTestId('audio-title').inputValue()).toEqual('Audio sample 1')
  })

  test('can upload and remove a thumbnail image', async function () {
    const thumbnailFilePath = fixture('large-image.jpeg')

    await focusEditor(page)
    await insertCardWithUpload(page, { cardName: 'audio', files: fixture('audio-sample.mp3') })

    // Upload thumbnail
    const thumbnailFileChooserPromise = page.waitForEvent('filechooser')
    await page.getByTestId('upload-thumbnail').click()
    const thumbnailFileChooser = await thumbnailFileChooserPromise
    await thumbnailFileChooser.setFiles([thumbnailFilePath])

    await expect(page.getByTestId('audio-thumbnail')).toBeVisible()

    // Remove thumbnail
    await page.getByTestId('remove-thumbnail').click()
    await expect(page.getByTestId('upload-thumbnail')).toBeVisible()
  })

  test('can upload dropped thumbnail', async function () {
    const filePath = fixture('large-image.png')
    await focusEditor(page)
    await insertCardWithUpload(page, { cardName: 'audio', files: fixture('audio-sample.mp3') })

    // Check that audio file was uploaded
    await expect(page.getByTestId('media-duration')).toContainText('0:19')

    // Create and dispatch data transfer
    const dataTransfer = await createDataTransfer(page, [
      { filePath, fileName: 'large-image.png', fileType: 'image/png' },
    ])
    await page.getByTestId('audio-card-populated').dispatchEvent('dragover', { dataTransfer })

    // Dragover text should be visible
    await expect(page.getByTestId('audio-thumbnail-dragover')).toBeVisible()

    // Drop file
    await page.getByTestId('audio-card-populated').dispatchEvent('drop', { dataTransfer })

    // Check that audio file was uploaded
    await expect(page.getByTestId('audio-thumbnail')).toBeVisible()
  })

  test('can show errors if was dropped a file with wrong extension to thumbnail', async function () {
    const filePath = fixture('video.mp4')
    await focusEditor(page)
    await insertCardWithUpload(page, { cardName: 'audio', files: fixture('audio-sample.mp3') })

    // Check that audio file was uploaded
    await expect(page.getByTestId('media-duration')).toContainText('0:19')

    // Create and dispatch data transfer
    const dataTransfer = await createDataTransfer(page, [{ filePath, fileName: 'video.mp4', fileType: 'video/mp4' }])
    await page.getByTestId('audio-card-populated').dispatchEvent('drop', { dataTransfer })

    // Errors should be visible
    await expect(page.getByTestId('thumbnail-errors')).toBeVisible()
  })

  test('shows errors on a failed thumbnail upload', async function () {
    const thumbnailFilePath = fixture('large-image-fail.jpeg')

    await focusEditor(page)
    await insertCardWithUpload(page, { cardName: 'audio', files: fixture('audio-sample.mp3') })

    // Upload thumbnail
    const thumbnailFileChooserPromise = page.waitForEvent('filechooser')
    await page.getByTestId('upload-thumbnail').click()
    const thumbnailFileChooser = await thumbnailFileChooserPromise
    await thumbnailFileChooser.setFiles([thumbnailFilePath])

    await page.waitForSelector('[data-testid="thumbnail-errors"]')
    expect(await page.getByTestId('thumbnail-errors').textContent()).toEqual('Upload failed')
  })

  test('renders audio card toolbar', async function () {
    await focusEditor(page)
    await insertCardWithUpload(page, { cardName: 'audio', files: fixture('audio-sample.mp3') })

    // Leave editing mode to display the toolbar
    await expect(page.getByTestId('audio-title')).toBeVisible()
    await page.keyboard.press('Escape')

    // Check that the toolbar is displayed
    await expect(page.locator('[data-inkling-card-toolbar="audio"]')).toBeVisible()
  })

  test('audio card toolbar has Edit button', async function () {
    await focusEditor(page)
    await insertCardWithUpload(page, { cardName: 'audio', files: fixture('audio-sample.mp3') })

    // Leave editing mode to display the toolbar
    await expect(page.getByTestId('audio-title')).toBeVisible()
    await page.keyboard.press('Escape')

    // Check that the toolbar is displayed
    await expect(page.locator('[data-inkling-card-toolbar="audio"]')).toBeVisible()

    await page.waitForSelector('[data-inkling-card-toolbar="audio"] button[aria-label="Edit"]')
    await page.locator('[data-inkling-card-toolbar="audio"] button[aria-label="Edit"]').click()

    await assertHTML(
      page,
      html`
        <div data-lexical-decorator="true" contenteditable="false">
          <div data-inkling-card-editing="true" data-inkling-card-selected="true" data-inkling-card="audio"></div>
        </div>
        <p><br /></p>
      `,
      { ignoreCardContents: true },
    )
  })

  test('should not be available for editing in preview mode', async function () {
    await focusEditor(page)
    await insertCardWithUpload(page, { cardName: 'audio', files: fixture('audio-sample.mp3') })

    // Check that audio file was uploaded
    await expect(page.getByTestId('media-duration')).toContainText('0:19')
    await page.keyboard.press('Escape')

    // Title input should be read only
    await expect(page.getByTestId('audio-title')).toHaveAttribute('readOnly', '')

    const filePath = fixture('large-image.png')
    // Create and dispatch data transfer
    const dataTransfer = await createDataTransfer(page, [
      { filePath, fileName: 'large-image.png', fileType: 'image/png' },
    ])
    await page.getByTestId('audio-card-populated').dispatchEvent('dragover', { dataTransfer })

    // Dragover text shouldn't be visible
    await expect(page.getByTestId('audio-thumbnail-dragover')).toBeHidden()
  })

  test('does not add extra paragraph when audio is inserted mid-document', async function () {
    await focusEditor(page)
    await page.keyboard.press('Enter')
    await page.keyboard.type('Testing')
    await page.keyboard.press('ArrowUp')
    await page.click('[data-inkling-plus-button]')

    await Promise.all([page.waitForEvent('filechooser'), page.click('[data-inkling-card-menu-item="Audio"]')])

    await assertHTML(
      page,
      html`
        <div data-lexical-decorator="true" contenteditable="false">
          <div data-inkling-card-editing="true" data-inkling-card-selected="true" data-inkling-card="audio"></div>
        </div>
        <p dir="ltr"><span data-lexical-text="true">Testing</span></p>
      `,
      { ignoreCardContents: true },
    )
  })

  test('adds extra paragraph when audio is inserted at end of document', async function () {
    await focusEditor(page)
    await page.click('[data-inkling-plus-button]')

    await Promise.all([page.waitForEvent('filechooser'), page.click('[data-inkling-card-menu-item="Audio"]')])

    await assertHTML(
      page,
      html`
        <div data-lexical-decorator="true" contenteditable="false">
          <div data-inkling-card-editing="true" data-inkling-card-selected="true" data-inkling-card="audio"></div>
        </div>
        <p><br /></p>
      `,
      { ignoreCardContents: true },
    )
  })

  test('can add snippet', async function () {
    await focusEditor(page)
    await insertCardWithUpload(page, { cardName: 'audio', files: fixture('audio-sample.mp3') })

    // Check that audio file was uploaded
    await expect(page.getByTestId('audio-title')).toBeVisible()
    expect(await page.getByTestId('audio-title').inputValue()).toEqual('Audio sample')

    // create snippet
    await page.keyboard.press('Escape')
    await createSnippet(page)

    // can insert card from snippet
    await page.keyboard.press('Enter')
    await page.keyboard.type('/snippet')
    await expect(page.locator('[data-inkling-cardmenu-selected="true"]').filter({ hasText: 'snippet' })).toBeVisible()
    await page.keyboard.press('Enter')
    await expect(page.locator('[data-inkling-card="audio"]')).toHaveCount(2)
  })
})
