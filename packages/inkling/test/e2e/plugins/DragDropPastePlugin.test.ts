import { expect, test, type Page } from '@playwright/test'

import { assertHTML, createDataTransfer, fixture, focusEditor, html, initialize } from '#/utils/e2e'

test.describe('Drag Drop Paste Plugin', function () {
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

  test('can drag and drop an image on the editor', async function () {
    await focusEditor(page)

    const filePath = fixture('large-image.png')
    const dataTransfer = await createDataTransfer(page, [
      { filePath, fileName: 'large-image.png', fileType: 'image/png' },
    ])

    await page.locator('.inkling-prose').dispatchEvent('dragenter', { dataTransfer })
    await page.locator('.inkling-prose').dispatchEvent('drop', { dataTransfer })

    // wait for card visibility
    await expect(page.getByTestId('image-card-populated')).toBeVisible()

    await assertHTML(
      page,
      html`
        <div data-lexical-decorator="true" contenteditable="false">
          <div data-inkling-card-editing="false" data-inkling-card-selected="true" data-inkling-card="image">
            <figure data-inkling-card-width="regular">
              <div>
                <img alt="" src="blob:..." />
              </div>

              <figcaption>
                <input placeholder="Type caption for image (optional)" value="" />
                <button name="alt-toggle-button" type="button">Alt</button>
              </figcaption>
            </figure>
          </div>
        </div>
        <p><br /></p>
      `,
      { ignoreCardToolbarContents: true, ignoreCardContents: true },
    )
  })

  test('can drag and drop multiple images on the editor', async function () {
    await focusEditor(page)
    const filePath = fixture('large-image.png')
    const filePath2 = fixture('large-image.jpeg')
    const dataTransfer = await createDataTransfer(page, [
      { filePath, fileName: 'large-image.png', fileType: 'image/png' },
      { filePath: filePath2, fileName: 'large-image.jpeg', fileType: 'image/jpeg' },
    ])

    await page.locator('.inkling-prose').dispatchEvent('dragenter', { dataTransfer })
    await page.locator('.inkling-prose').dispatchEvent('drop', { dataTransfer })

    // wait for card visibility
    await expect(page.getByTestId('image-card-populated')).toHaveCount(2)

    await assertHTML(
      page,
      html`
        <div data-lexical-decorator="true" contenteditable="false">
          <div data-inkling-card-editing="false" data-inkling-card-selected="false" data-inkling-card="image"></div>
        </div>
        <div data-lexical-decorator="true" contenteditable="false">
          <div data-inkling-card-editing="false" data-inkling-card-selected="true" data-inkling-card="image"></div>
        </div>
        <p><br /></p>
      `,
      { ignoreCardToolbarContents: true, ignoreCardContents: true },
    )
  })

  test('can drag and drop an audio file on the editor', async function () {
    await focusEditor(page)

    const filePath = fixture('audio-sample.mp3')
    const dataTransfer = await createDataTransfer(page, [
      { filePath, fileName: 'audio-sample.mp3', fileType: 'audio/mp3' },
    ])

    await page.locator('.inkling-prose').dispatchEvent('dragenter', { dataTransfer })
    await page.locator('.inkling-prose').dispatchEvent('drop', { dataTransfer })

    await assertHTML(
      page,
      html`
        <div data-lexical-decorator="true" contenteditable="false">
          <div data-inkling-card-editing="false" data-inkling-card-selected="true" data-inkling-card="audio"></div>
        </div>
        <p><br /></p>
      `,
      { ignoreCardContents: true },
    )
  })

  test('can drag and drop multiple audio files on the editor', async function () {
    await focusEditor(page)
    const filePath = fixture('audio-sample.mp3')
    const filePath2 = fixture('audio-sample.mp3')

    const dataTransfer = await createDataTransfer(page, [
      { filePath, fileName: 'audio-sample-1.mp3', fileType: 'audio/mp3' },
      { filePath: filePath2, fileName: 'audio-sample-2.mp3', fileType: 'audio/mp3' },
    ])

    await page.locator('.inkling-prose').dispatchEvent('dragenter', { dataTransfer })
    await page.locator('.inkling-prose').dispatchEvent('drop', { dataTransfer })

    await expect(page.locator('input[value="Audio sample 1"]')).toBeVisible()
    await expect(page.locator('input[value="Audio sample 2"]')).toBeVisible()

    await assertHTML(
      page,
      html`
        <div data-lexical-decorator="true" contenteditable="false">
          <div data-inkling-card-editing="false" data-inkling-card-selected="false" data-inkling-card="audio"></div>
        </div>
        <div data-lexical-decorator="true" contenteditable="false">
          <div data-inkling-card-editing="false" data-inkling-card-selected="true" data-inkling-card="audio"></div>
        </div>
        <p><br /></p>
      `,
      { ignoreCardContents: true, ignoreInnerSVG: false },
    )
  })
})
