import { expect, test, type Page } from '@playwright/test'

import { focusEditor, getEditorStateJSON, initialize } from '#/utils/e2e'

// The demo's fixture image library (demo/utils/imageLibrary.ts): two local
// static images, gated on `?imageLibrary=fixture`; `fixture-upload` adds the
// upload stub. The default demo host has no library config.
test.describe('Image library picker', () => {
  let page: Page
  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage()
  })

  test.afterAll(async () => {
    await page.close()
  })

  test.describe('with the fixture library', () => {
    test.beforeEach(async () => {
      await initialize({ page, uri: '/#/?content=false&imageLibrary=fixture' })
    })

    async function openPicker() {
      await focusEditor(page)
      await page.keyboard.type('/library')
      await page.waitForSelector('[data-inkling-card-menu-item="Image library"]')
      await page.keyboard.press('Enter')
      await expect(page.getByTestId('library-selector')).toBeVisible()
    }

    test('opens the picker via slash /library, hiding the image card body', async () => {
      await openPicker()

      // the placeholder image card renders the overlay only — the card body
      // (figure / upload chrome) stays hidden while the picker is open
      await expect(page.locator('[data-inkling-card="image"]')).toHaveCount(1)
      await expect(page.locator('[data-inkling-card="image"] figure')).toHaveCount(0)

      // the default listing fires immediately on open, square tiles with a
      // dims badge — and no upload button without the callback configured
      await expect(page.locator('[data-testid="library-item"]')).toHaveCount(2)
      await expect(page.locator('[data-testid="library-item"] span').first()).toHaveText('1200×800')
      await expect(page.getByTestId('library-upload')).toHaveCount(0)
    })

    test('filters the grid by search', async () => {
      await openPicker()

      await expect(page.locator('[data-testid="library-item"]')).toHaveCount(2)

      await page.fill('[data-testid="library-selector"] input', 'dark')
      await expect(page.locator('[data-testid="library-item"]')).toHaveCount(1)
      await expect(page.locator('[data-testid="library-item"] img')).toHaveAttribute('src', '/inkling-editor-2.png')

      // a term with no matches shows the empty state
      await page.fill('[data-testid="library-selector"] input', 'nothing matches this')
      await expect(page.getByTestId('library-selector-empty')).toBeVisible()
      await expect(page.locator('[data-testid="library-item"]')).toHaveCount(0)
    })

    test('inserts an image card with src, alt, and dimensions from the picked tile', async () => {
      await openPicker()

      await page.locator('[data-testid="library-item"]').first().click()

      await expect(page.getByTestId('library-selector')).toHaveCount(0)
      await expect(page.getByTestId('image-card-populated')).toBeAttached()

      const state = JSON.parse(await getEditorStateJSON(page))
      const imageNode = state.root.children.find((child: { type: string }) => child.type === 'image')
      expect(imageNode.src).toBe('/inkling-editor-1.png')
      expect(imageNode.alt).toBe('Editor screenshot, light theme')
      expect(imageNode.width).toBe(1200)
      expect(imageNode.height).toBe(800)
      // the fixture's host-schema keys ride the dataset but are silently
      // ignored by the stock image declaration
      expect(imageNode).not.toHaveProperty('thumbhash')
      expect(imageNode).not.toHaveProperty('storagePath')
      expect(imageNode).not.toHaveProperty('imageId')
    })

    test('Escape cancels the picker and removes the placeholder node', async () => {
      await openPicker()

      await page.keyboard.press('Escape')

      await expect(page.getByTestId('library-selector')).toHaveCount(0)
      await expect(page.locator('[data-inkling-card="image"]')).toHaveCount(0)

      // the document holds no trace of the placeholder
      const state = JSON.parse(await getEditorStateJSON(page))
      expect(state.root.children).toHaveLength(1)
      expect(state.root.children[0].type).toBe('paragraph')
    })

    test('clicking outside cancels the picker and removes the placeholder node', async () => {
      await openPicker()

      // a mousedown outside the selector (left of the editor column)
      await page.mouse.click(30, 500)

      await expect(page.getByTestId('library-selector')).toHaveCount(0)
      await expect(page.locator('[data-inkling-card="image"]')).toHaveCount(0)

      const state = JSON.parse(await getEditorStateJSON(page))
      expect(state.root.children).toHaveLength(1)
      expect(state.root.children[0].type).toBe('paragraph')
    })
  })

  test.describe('with the fixture upload stub', () => {
    test.beforeEach(async () => {
      await initialize({ page, uri: '/#/?content=false&imageLibrary=fixture-upload' })
    })

    test('shows the upload button and inserts its resolution as the pick', async () => {
      await focusEditor(page)
      await page.keyboard.type('/library')
      await page.waitForSelector('[data-inkling-card-menu-item="Image library"]')
      await page.keyboard.press('Enter')

      const uploadButton = page.getByTestId('library-upload')
      await expect(uploadButton).toBeVisible()
      await uploadButton.click()

      // the host's upload resolution is treated as the selection — the same
      // onPick path as a tile click
      await expect(page.getByTestId('library-selector')).toHaveCount(0)
      await expect(page.getByTestId('image-card-populated')).toBeAttached()

      const state = JSON.parse(await getEditorStateJSON(page))
      const imageNode = state.root.children.find((child: { type: string }) => child.type === 'image')
      expect(imageNode.src).toBe('/inkling-editor-2.png')
      expect(imageNode.alt).toBe('Uploaded from the picker')
      expect(imageNode.width).toBe(1600)
      expect(imageNode.height).toBe(900)
    })
  })

  test.describe('without a library config', () => {
    test.beforeEach(async () => {
      await initialize({ page })
    })

    test('the menu has no Image library entry', async () => {
      await focusEditor(page)
      await page.keyboard.type('/library')

      await expect(page.locator('[data-inkling-card-menu-item="Image library"]')).toHaveCount(0)
      await expect(page.getByTestId('library-selector')).toHaveCount(0)
    })
  })
})
