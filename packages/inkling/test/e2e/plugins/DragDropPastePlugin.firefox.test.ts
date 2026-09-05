import { expect, test, type Page } from '@playwright/test'

import { assertHTML, createDataTransfer, fixture, focusEditor, html, initialize } from '#/utils/e2e'

// Video card is tested in firefox
// Need to get video thumbnail before uploading on the server; for this purpose, convert video to blob (see extractVideoMetadata.js)
// The problem is that Chromium can't read video src as blob
test.describe('Drag Drop Paste Plugin Firefox', function () {
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

  test('can drag and drop a video file on the editor', async function () {
    await focusEditor(page)

    const filePath = fixture('video.mp4')
    const dataTransfer = await createDataTransfer(page, [{ filePath, fileName: 'video.mp4', fileType: 'video/mp4' }])

    await page.locator('.inkling-prose').dispatchEvent('dragenter', { dataTransfer })
    await page.locator('.inkling-prose').dispatchEvent('drop', { dataTransfer })

    // Check that video file was uploaded
    await expect(page.getByTestId('media-duration')).toContainText('0:04')
  })

  test('can drag and drop multiple video files on the editor', async function () {
    await focusEditor(page)
    const filePath = fixture('video.mp4')
    const filePath2 = fixture('video.mp4')
    const dataTransfer = await createDataTransfer(page, [
      { filePath, fileName: 'video-1.mp4', fileType: 'video/mp4' },
      { filePath: filePath2, fileName: 'video-2.mp4', fileType: 'video/mp4' },
    ])

    await page.locator('.inkling-prose').dispatchEvent('dragenter', { dataTransfer })
    await page.locator('.inkling-prose').dispatchEvent('drop', { dataTransfer })

    // wait for card visibility
    await expect(page.getByTestId('media-duration')).toHaveCount(2)

    await assertHTML(
      page,
      html`
        <div data-lexical-decorator="true" contenteditable="false">
          <div data-inkling-card-editing="false" data-inkling-card-selected="false" data-inkling-card="video"></div>
        </div>
        <div data-lexical-decorator="true" contenteditable="false">
          <div data-inkling-card-editing="false" data-inkling-card-selected="true" data-inkling-card="video"></div>
        </div>
        <p><br /></p>
      `,
      { ignoreCardContents: true, ignoreInnerSVG: false },
    )
  })

  test('can drag and drop multiple different types of files on the editor', async function () {
    await focusEditor(page)
    const filePath = fixture('large-image.png')
    const filePath2 = fixture('audio-sample.mp3')
    const filePath3 = fixture('video.mp4')
    const dataTransfer = await createDataTransfer(page, [
      { filePath, fileName: 'large-image.png', fileType: 'image/png' },
      { filePath: filePath2, fileName: 'audio-sample.mp3', fileType: 'audio/mp3' },
      { filePath: filePath3, fileName: 'video.mp4', fileType: 'video/mp4' },
    ])

    await page.locator('.inkling-prose').dispatchEvent('dragenter', { dataTransfer })
    await page.locator('.inkling-prose').dispatchEvent('drop', { dataTransfer })

    // Wait for uploads to complete
    await expect(page.locator('input[value="Audio sample"]')).toBeVisible()
    await expect(page.getByTestId('image-card-populated')).toBeVisible()
    await expect(page.locator('[data-testid="video-card-populated"] [data-testid="media-duration"]')).toContainText(
      '0:04',
    )

    await assertHTML(
      page,
      html`
        <div data-lexical-decorator="true" contenteditable="false">
          <div data-inkling-card-editing="false" data-inkling-card-selected="false" data-inkling-card="image"></div>
        </div>
        <div data-lexical-decorator="true" contenteditable="false">
          <div data-inkling-card-editing="false" data-inkling-card-selected="false" data-inkling-card="audio"></div>
        </div>
        <div data-lexical-decorator="true" contenteditable="false">
          <div data-inkling-card-editing="false" data-inkling-card-selected="true" data-inkling-card="video"></div>
        </div>
        <p><br /></p>
      `,
      { ignoreCardContents: true, ignoreInnerSVG: false },
    )
  })
})
