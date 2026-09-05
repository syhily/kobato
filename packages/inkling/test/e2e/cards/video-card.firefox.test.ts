import { expect, test, type Page } from '@playwright/test'

import {
  assertHTML,
  createDataTransfer,
  createSnippet,
  ctrlOrCmd,
  fixture,
  focusEditor,
  html,
  initialize,
  insertCard,
  insertCardWithUpload,
  waitForCardContentSynced,
  waitForHistoryGroupBoundary,
} from '#/utils/e2e'

// Video card is tested in firefox
// Need to get video thumbnail before uploading on the server; for this purpose, convert video to blob (see extractVideoMetadata.js)
// The problem is that Chromium can't read video src as blob
test.describe('Video card', () => {
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

  test('can import serialized video card nodes', async function () {
    const contentParam = encodeURIComponent(
      JSON.stringify({
        root: {
          children: [
            {
              type: 'video',
              src: '/content/images/2022/11/inkling-lexical.jpg',
              width: 100,
              height: 100,
              caption: 'This is a caption',
              duration: 60,
              thumbnailSrc: '/content/images/2022/12/inkling-lexical.png',
            },
          ],
          direction: null,
          format: '',
          indent: 0,
          type: 'root',
          version: 1,
        },
      }),
    )

    await initialize({ page, uri: `/#/?content=${contentParam}` })

    await assertHTML(
      page,
      html`
        <div data-lexical-decorator="true" contenteditable="false">
          <div data-inkling-card-editing="false" data-inkling-card-selected="false" data-inkling-card="video">
            <figure>
              <div>
                <div>
                  <img alt="Video thumbnail" src="/content/images/2022/12/inkling-lexical.png" />
                </div>
                <div>
                  <button type="button"><svg></svg></button>
                </div>
                <div>
                  <div>
                    <svg></svg>
                    <div>
                      <span>0:00</span>
                      /
                      <span>1:00</span>
                    </div>
                    <div><button type="button"></button></div>
                    <button type="button">1×</button>
                    <button type="button"><svg></svg></button>
                    <div>
                      <div></div>
                      <button type="button"></button>
                    </div>
                  </div>
                </div>
                <div></div>
              </div>
              <figcaption>
                <div data-inkling-allow-clickthrough="true">
                  <div>
                    <div data-inkling="editor">
                      <div contenteditable="true" role="textbox" spellcheck="true" data-lexical-editor="true">
                        <p dir="ltr">
                          <span data-lexical-text="true">This is a caption</span>
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </figcaption>
            </figure>
          </div>
        </div>
      `,
      { ignoreCardToolbarContents: true, ignoreInnerSVG: true },
    )
  })

  test('renders video card node', async function () {
    const fileChooserPromise = page.waitForEvent('filechooser')
    const filePath = fixture('video.mp4')

    await focusEditor(page)
    await insertCard(page, { cardName: 'video' })
    const fileChooser = await fileChooserPromise

    await assertHTML(
      page,
      html`
        <div data-lexical-decorator="true" contenteditable="false">
          <div data-inkling-card-editing="true" data-inkling-card-selected="true" data-inkling-card="video"></div>
        </div>
        <p><br /></p>
      `,
      { ignoreCardContents: true },
    )

    // Close the fileChooser by selecting a file
    // Without this line, fileChooser stays open for subsequent tests
    await fileChooser.setFiles([filePath])
  })

  test('can upload video file from slash menu', async function () {
    const filePath = fixture('video.mp4')

    await focusEditor(page)

    // Upload video file
    await insertCardWithUpload(page, { cardName: 'video', files: filePath })

    // Check that video file was uploaded
    await expect(page.getByTestId('media-duration')).toContainText('0:04')
  })

  test('can upload video file from card menu', async function () {
    await focusEditor(page)
    await insertCardWithUpload(page, { cardName: 'video', files: fixture('video.mp4') })

    // Check that video file was uploaded
    await expect(page.getByTestId('media-duration')).toContainText('0:04')
  })

  test('can show errors for failed video upload', async function () {
    await focusEditor(page)
    await insertCardWithUpload(page, { cardName: 'video', files: fixture('video-fail.mp4') })

    // Errors should be visible
    await expect(page.getByTestId('media-placeholder-errors')).toBeVisible()
  })

  test('can manage custom thumbnail', async function () {
    await focusEditor(page)
    await insertCardWithUpload(page, { cardName: 'video', files: fixture('video.mp4') })

    // Settings panel should be visible
    await expect(page.getByTestId('settings-panel')).toBeVisible()

    // Custom thumbnail should be visible
    const emptyThumbnail = page.getByTestId('media-upload-placeholder')
    await expect(emptyThumbnail).toBeVisible()

    // Upload thumbnail
    const imagePath = fixture('large-image.png')
    const fileChooserPromise = page.waitForEvent('filechooser')
    await emptyThumbnail.click()
    const fileChooser = await fileChooserPromise
    await fileChooser.setFiles([imagePath])

    // Thumbnail should be visible
    await expect(page.getByTestId('media-upload-filled')).toBeVisible()

    // Can remove thumbnail
    const replaceButton = page.getByTestId('media-upload-remove')
    await replaceButton.click()
    await expect(page.getByTestId('media-upload-placeholder')).toBeVisible()
  })

  test('can show errors for custom thumbnail', async function () {
    await focusEditor(page)
    await insertCardWithUpload(page, { cardName: 'video', files: fixture('video.mp4') })

    // Settings panel should be visible
    await expect(page.getByTestId('settings-panel')).toBeVisible()

    // Errors shouldn't be visible
    await expect(page.getByTestId('media-placeholder-errors')).toBeHidden()

    // Custom thumbnail should be visible
    const emptyThumbnail = page.getByTestId('media-upload-placeholder')

    // Upload thumbnail
    const imagePath = fixture('large-image-fail.jpeg')
    const fileChooserPromise = page.waitForEvent('filechooser')
    await emptyThumbnail.click()
    const fileChooser = await fileChooserPromise
    await fileChooser.setFiles([imagePath])

    // Errors should be visible
    await expect(page.getByTestId('media-upload-errors')).toBeVisible()
  })

  test('can upload dropped video', async function () {
    const filePath = fixture('video.mp4')

    await focusEditor(page)

    // Open video card and dismiss files chooser to prepare card for video dropping
    await insertCardWithUpload(page, { cardName: 'video', files: [] })

    // Create and dispatch data transfer
    const dataTransfer = await createDataTransfer(page, [{ filePath, fileName: 'video.mp4', fileType: 'video/mp4' }])
    await page.getByTestId('media-placeholder').dispatchEvent('dragover', { dataTransfer })

    // Dragover text should be visible
    await expect(page.locator('[data-inkling-card-drag-text="true"]')).toBeVisible()

    // Drop file
    await page.getByTestId('media-placeholder').dispatchEvent('drop', { dataTransfer })

    // Check that video file was uploaded
    await expect(page.getByTestId('media-duration')).toContainText('0:04')
  })

  test('can show errors if was dropped a file with wrong extension to video placeholder', async function () {
    const filePath = fixture('large-image.png')

    await focusEditor(page)

    // Open video card and dismiss files chooser to prepare card for video dropping
    await insertCardWithUpload(page, { cardName: 'video', files: [] })

    //  Drop file
    const dataTransfer = await createDataTransfer(page, [
      { filePath, fileName: 'large-image.png', fileType: 'image/png' },
    ])
    await page.getByTestId('media-placeholder').dispatchEvent('dragover', { dataTransfer })
    await page.getByTestId('media-placeholder').dispatchEvent('drop', { dataTransfer })

    // Errors should be visible
    await expect(page.getByTestId('media-placeholder-errors')).toBeVisible()
  })

  test('can upload dropped custom thumbnail', async function () {
    const filePath = fixture('large-image.png')

    await focusEditor(page)
    await insertCardWithUpload(page, { cardName: 'video', files: fixture('video.mp4') })

    // Wait for custom thumbnail
    await page.waitForSelector('[data-testid="media-upload-placeholder"]')

    // Create and dispatch data transfer
    const dataTransfer = await createDataTransfer(page, [
      { filePath, fileName: 'large-image.png', fileType: 'image/png' },
    ])
    await page.getByTestId('media-upload-placeholder').dispatchEvent('dragover', { dataTransfer })

    // Dragover text should be visible
    await expect(page.locator('[data-inkling-card-drag-text="true"]')).toBeVisible()

    // Drop file
    await page.getByTestId('media-upload-placeholder').dispatchEvent('drop', { dataTransfer })

    // Thumbnail should be visible
    await expect(page.getByTestId('media-upload-filled')).toBeVisible()
  })

  test('can show errors if was dropped a file with wrong extension to custom thumbnail', async function () {
    const filePath = fixture('video.mp4')

    await focusEditor(page)
    await insertCardWithUpload(page, { cardName: 'video', files: fixture('video.mp4') })

    // Wait for custom thumbnail
    await page.waitForSelector('[data-testid="media-upload-placeholder"]')

    // Create and dispatch data transfer
    const dataTransfer = await createDataTransfer(page, [{ filePath, fileName: 'video.mp4', fileType: 'video/mp4' }])
    await page.getByTestId('media-upload-placeholder').dispatchEvent('drop', { dataTransfer })

    // Errors should be visible
    await expect(page.getByTestId('media-upload-errors')).toBeVisible()
  })

  test('renders video card toolbar', async function () {
    await focusEditor(page)

    // Upload video
    await insertCardWithUpload(page, { cardName: 'video', files: fixture('video.mp4') })
    await page.waitForSelector('[data-testid="media-upload-placeholder"]')

    // Leave editing mode to display the toolbar
    await page.keyboard.press('Escape')

    // Check that the toolbar is displayed
    await expect(page.locator('[data-inkling-card-toolbar="video"]')).toBeVisible()
  })

  test('video card toolbar has Edit button', async function () {
    await focusEditor(page)

    // Upload video
    await insertCardWithUpload(page, { cardName: 'video', files: fixture('video.mp4') })
    await page.waitForSelector('[data-testid="media-upload-placeholder"]')

    // Leave editing mode to display the toolbar
    await page.keyboard.press('Escape')

    // Check that the toolbar is displayed
    await expect(page.locator('[data-inkling-card-toolbar="video"]')).toBeVisible()

    // Edit video card
    await page.waitForSelector('[data-testid="edit-video-card"]')
    await page.getByTestId('edit-video-card').click()

    await assertHTML(
      page,
      html`
        <div data-lexical-decorator="true" contenteditable="false">
          <div data-inkling-card-editing="true" data-inkling-card-selected="true" data-inkling-card="video"></div>
        </div>
        <p><br /></p>
      `,
      { ignoreCardContents: true },
    )
  })

  test('adds extra paragraph when video is inserted at end of document', async function () {
    await focusEditor(page)
    await page.click('[data-inkling-plus-button]')

    await Promise.all([page.waitForEvent('filechooser'), page.click('[data-inkling-card-menu-item="Video"]')])

    await assertHTML(
      page,
      html`
        <div data-lexical-decorator="true" contenteditable="false">
          <div data-inkling-card-editing="true" data-inkling-card-selected="true" data-inkling-card="video"></div>
        </div>
        <p><br /></p>
      `,
      { ignoreCardContents: true },
    )
  })

  test('does not add extra paragraph when video is inserted mid-document', async function () {
    await focusEditor(page)
    await page.keyboard.press('Enter')
    await page.keyboard.type('Testing')
    await page.keyboard.press('ArrowUp')
    await page.click('[data-inkling-plus-button]')

    await Promise.all([page.waitForEvent('filechooser'), page.click('[data-inkling-card-menu-item="Video"]')])

    await assertHTML(
      page,
      html`
        <div data-lexical-decorator="true" contenteditable="false">
          <div data-inkling-card-editing="true" data-inkling-card-selected="true" data-inkling-card="video"></div>
        </div>
        <p dir="ltr"><span data-lexical-text="true">Testing</span></p>
      `,
      { ignoreCardContents: true },
    )
  })

  test('can add snippet', async function () {
    await focusEditor(page)

    // Upload video
    await insertCardWithUpload(page, { cardName: 'video', files: fixture('video.mp4') })
    await page.waitForSelector('[data-testid="media-upload-placeholder"]')

    // create snippet
    await page.keyboard.press('Escape')
    await createSnippet(page)

    // can insert card from snippet
    await page.keyboard.press('Enter')
    await page.keyboard.type('/snippet')
    await expect(page.locator('[data-inkling-cardmenu-selected="true"]').filter({ hasText: 'snippet' })).toBeVisible()
    await page.keyboard.press('Enter')
    await expect(page.locator('[data-inkling-card="video"]')).toHaveCount(2)
  })

  test('can undo/redo without losing nested editor content', async () => {
    await focusEditor(page)
    // Upload video
    await insertCardWithUpload(page, { cardName: 'video', files: fixture('video.mp4') })
    // Wait for the upload to fully complete (play button appears) before editing
    // the caption so that upload-related editor updates are done and won't land
    // in the history stack after the card is deleted.
    await expect(page.locator('[data-testid="video-card-populated"] button').first()).toBeVisible()
    // Ensure the async upload has fully populated the node state (video src and
    // thumbnail src) before we edit the caption. On Firefox the thumbnail upload
    // can finish after the video upload, leaving history entries that undo past
    // the populated state.
    await page.waitForFunction(() => {
      const rootElement = document.querySelector('div[contenteditable="true"]')
      if (!rootElement) {
        return false
      }
      const editor = (rootElement as HTMLElement & { __lexicalEditor?: import('lexical').LexicalEditor })
        .__lexicalEditor
      if (!editor) {
        return false
      }
      const state = editor.getEditorState().toJSON()
      const video = state.root.children.find(
        (child: { type?: string; src?: string; thumbnailSrc?: string }) => child.type === 'video',
      )
      return video && 'src' in video && 'thumbnailSrc' in video && video.src && video.thumbnailSrc
    })

    await page.click('[data-testid="video-card-caption"]')
    await page.keyboard.type('Test caption')
    await page.keyboard.press('Escape')
    await waitForCardContentSynced(page, 'video', 'Test caption')

    // Wait for any async upload state to settle before deleting the card so the
    // undo history only contains the deletion to revert.
    await page.waitForTimeout(500)

    // Lexical's history plugin can merge a decorator node's deletion with the
    // preceding property updates if they fall inside the 1000 ms merge window.
    // Insert and remove a temporary paragraph so the card deletion becomes its
    // own undo group (matches the toggle card undo/redo pattern).
    await page.keyboard.press('Enter')
    await page.keyboard.press('Backspace')
    await waitForHistoryGroupBoundary(page)

    await page.keyboard.press('Backspace')

    await page.keyboard.press(`${ctrlOrCmd(page)}+z`)

    await assertHTML(
      page,
      html`
        <div data-lexical-decorator="true" contenteditable="false">
          <div data-inkling-card-editing="false" data-inkling-card-selected="true" data-inkling-card="video">
            <figure>
              <div>
                <div>
                  <img alt="Video thumbnail" src="blob:..." />
                </div>
                <div>
                  <button type="button"><svg></svg></button>
                </div>
                <div>
                  <div>
                    <svg></svg>
                    <div>
                      <span>0:00</span>
                      /
                      <span>0:04</span>
                    </div>
                    <div><button type="button"></button></div>
                    <button type="button">1×</button>
                    <button type="button"><svg></svg></button>
                    <div>
                      <div></div>
                      <button type="button"></button>
                    </div>
                  </div>
                </div>
                <div></div>
              </div>
              <figcaption>
                <div data-inkling-allow-clickthrough="true">
                  <div>
                    <div data-inkling="editor">
                      <div contenteditable="true" role="textbox" spellcheck="true" data-lexical-editor="true">
                        <p dir="ltr">
                          <span data-lexical-text="true">Test caption</span>
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </figcaption>
            </figure>
            <div data-inkling-card-toolbar="video"></div>
          </div>
        </div>
        <p><br /></p>
      `,
      { ignoreCardToolbarContents: true, ignoreInnerSVG: true },
    )
  })
})
