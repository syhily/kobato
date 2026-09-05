import { expect, test, type Page } from '@playwright/test'

import { selectCustomColor, selectTitledColor } from '#/utils/color-select-helper'
import { assertHTML, fixture, focusEditor, html, initialize } from '#/utils/e2e'

async function createHeaderCard({ page }: { page: Page }) {
  await focusEditor(page)
  await page.keyboard.type('/header')
  await page.waitForSelector('[data-inkling-card-menu-item="Header"][data-inkling-cardmenu-selected="true"]')
  await page.keyboard.press('Enter')
  await page.waitForSelector('[data-inkling-card="header"]')
}

test.describe('Header card V2', () => {
  // const ctrlOrCmd = isMac() ? 'Meta' : 'Control';
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

  test('can import serialized header card nodes', async function () {
    const contentParam = encodeURIComponent(
      JSON.stringify({
        root: {
          children: [
            {
              version: 2,
              type: 'header',
              size: 'small',
              style: 'image',
              buttonEnabled: false,
              buttonUrl: '',
              buttonText: '',
              header: '<span>hello world</span>',
              subheader: '<span>hello sub</span>',
              backgroundImageSrc: 'blob:http://localhost:5173/fa0956a8-5fb4-4732-9368-18f9d6d8d25a',
              alignment: 'left',
              buttonColor: '#ffffff',
              buttonTextColor: '#000000',
              backgroundColor: 'accent',
              textColor: '#ffffff',
              swapped: false,
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
    await page.waitForSelector('[data-inkling-card="header"]')
    await page.waitForSelector('[data-inkling-card="header"] [data-inkling="editor"]')
    await expect(page.locator('[data-inkling-card="header"] [data-inkling="editor"]').nth(0)).toHaveText('hello world')
  })

  test('renders header card node', async function () {
    await createHeaderCard({ page })

    await assertHTML(
      page,
      html`
        <div data-lexical-decorator="true" contenteditable="false" data-inkling-card-width="full">
          <div data-inkling-card-editing="true" data-inkling-card-selected="true" data-inkling-card="header"></div>
        </div>
        <p><br /></p>
      `,
      { ignoreCardContents: true },
    )
  })

  test('can edit header', async function () {
    await createHeaderCard({ page })

    await page.keyboard.type('Hello world')
    const firstEditor = page.locator('[data-inkling-card="header"] [data-inkling="editor"]').nth(0)
    await expect(firstEditor).toHaveText('Hello world')
  })

  test('can edit sub header', async function () {
    await createHeaderCard({ page })

    await page.keyboard.type('Hello world')

    await page.keyboard.press('Enter')
    await page.keyboard.type('Hello subheader')

    const firstEditor = page.locator('[data-inkling-card="header"] [data-inkling="editor"]').nth(0)
    const secondEditor = page.locator('[data-inkling-card="header"] [data-inkling="editor"]').nth(1)

    await expect(firstEditor).toHaveText('Hello world')
    await expect(secondEditor).toHaveText('Hello subheader')
  })

  test('can edit sub header via arrow keys', async function () {
    await createHeaderCard({ page })

    await page.keyboard.type('Hello')

    await page.keyboard.press('ArrowDown')
    await page.keyboard.type('blah blah blah something very long')

    // Go back up again and add an extra word
    await page.keyboard.press('ArrowUp')
    await page.keyboard.type(' world')

    const firstEditor = page.locator('[data-inkling-card="header"] [data-inkling="editor"]').nth(0)
    const secondEditor = page.locator('[data-inkling-card="header"] [data-inkling="editor"]').nth(1)

    await expect(firstEditor).toHaveText('Hello world')
    await expect(secondEditor).toHaveText('blah blah blah something very long')
  })

  test('can add and remove button', async function () {
    await createHeaderCard({ page })

    // click on the toggle with data-testid="header-button-toggle"
    await page.click('[data-testid="header-button-toggle"]')

    // check button is visible
    await expect(page.getByTestId('header-card-button')).toHaveText('Add button text')

    // Enter some text for the button in data-testid="header-button-text"
    await page.click('[data-testid="header-button-text"]')
    await page.keyboard.type('Click me')

    // Enter some url for the button in data-testid="header-button-url"
    await page.click('[data-testid="header-button-url"]')
    await page.keyboard.type('https://example.com')

    // check button is visible, and not an <a> tag (so not clickable)
    // Page contains `<button type="button"><span>Click me</span></button>`
    await expect(page.getByTestId('header-card-button')).toHaveText('Click me')

    // Can toggle button off again
    await page.click('[data-testid="header-button-toggle"]')

    // check button is not visible by using expect
    await expect(page.getByTestId('header-card-button')).toHaveCount(0)
  })

  test('can change the button background color and text color', async function () {
    await createHeaderCard({ page })

    await page.click('[data-testid="header-button-toggle"]')

    await page.click('[data-testid="header-button-color"] [data-testid="color-selector-button"]')

    await selectCustomColor(page, '#ff0000', 'color-picker-toggle')

    await page.click('[data-testid="settings-panel"]')

    // // // Selected colour should be applied inline
    await expect(page.locator('[data-testid="header-card-button"]')).toHaveCSS('background-color', 'rgb(255, 0, 0)')
    await expect(page.locator('[data-testid="header-card-button"]')).toHaveCSS('color', 'rgb(255, 255, 255)')

    await page.click('[data-testid="header-button-color"] [data-testid="color-selector-button"]')
    await selectCustomColor(page, '#f7f7f7')

    await expect(page.locator('[data-testid="header-card-button"]')).toHaveCSS('background-color', 'rgb(247, 247, 247)')
    await expect(page.locator('[data-testid="header-card-button"]')).toHaveCSS('color', 'rgb(0, 0, 0)')
  })

  test('can change the background color and text color', async function () {
    await createHeaderCard({ page })

    await page.click('[data-testid="header-background-color"] [data-testid="color-selector-button"]')

    await selectCustomColor(page, '#ff0000', 'color-picker-toggle')

    await page.click('[data-testid="settings-panel"]')

    // Selected colour should be applied inline
    const container = page.getByTestId('header-card-container')
    await expect(container).toHaveCSS('background-color', 'rgb(255, 0, 0)')
    await expect(container).toHaveCSS('color', 'rgb(255, 255, 255)')

    await page.click('[data-testid="header-background-color"] [data-testid="color-selector-button"]')
    await selectCustomColor(page, '#f7f7f7')

    await expect(container).toHaveCSS('background-color', 'rgb(247, 247, 247)')
    await expect(container).toHaveCSS('color', 'rgb(0, 0, 0)')
  })

  test('can change to grey, black, brand background color', async function () {
    await createHeaderCard({ page })

    await page.click('[data-testid="header-background-color"] [data-testid="color-selector-button"]')

    await selectTitledColor(page, 'Grey', 'color-picker-toggle')

    const container = page.getByTestId('header-card-container')
    await expect(container).toHaveCSS('background-color', 'rgb(240, 240, 240)')
    await expect(container).toHaveCSS('color', 'rgb(0, 0, 0)')

    await selectTitledColor(page, 'Black', 'color-picker-toggle')

    await expect(container).toHaveCSS('background-color', 'rgb(0, 0, 0)')
    await expect(container).toHaveCSS('color', 'rgb(255, 255, 255)')

    await selectTitledColor(page, 'Brand color', 'color-picker-toggle')

    await expect(container).toHaveCSS('background-color', 'rgb(255, 0, 149)')
    await expect(container).toHaveCSS('color', 'rgb(255, 255, 255)')
  })

  test('can switch between background image and color', async function () {
    const filePath = fixture('large-image.jpeg')
    await createHeaderCard({ page })
    // Choose an image
    const fileChooserPromise = page.waitForEvent('filechooser')

    await page.click('[data-testid="color-selector-button"]')
    await page.click('[data-testid="header-background-image-toggle"]')
    await page.click('[data-testid="media-upload-placeholder"]')

    const fileChooser = await fileChooserPromise
    await fileChooser.setFiles([filePath])

    await expect(page.locator('[data-inkling-card="header"] > div:first-child')).toHaveCSS('background-image', /blob:/)
    await expect(page.locator('[data-testid="media-upload-setting"]')).toBeVisible()
    await expect(page.locator('[data-testid="media-upload-filled"] img')).toHaveAttribute('src', /blob:/)

    // Switch to a color swatch

    await page.click('[data-testid="header-background-color"] button[title="Black"]')

    await expect(page.locator('[data-inkling-card="header"] > div:first-child')).not.toHaveCSS(
      'background-image',
      /blob:/,
    )
    await expect(page.locator('[data-inkling-card="header"] > div:first-child')).toHaveCSS(
      'background-color',
      'rgb(0, 0, 0)',
    )
    await expect(page.locator('[data-testid="media-upload-setting"]')).not.toBeVisible()

    await page.click('[data-testid="color-selector-button"]')
    await page.click('[data-testid="header-background-image-toggle"]')

    await expect(page.locator('[data-inkling-card="header"] > div:first-child')).toHaveCSS('background-image', /blob:/)
    await expect(page.locator('[data-testid="media-upload-setting"]')).toBeVisible()
    await expect(page.locator('[data-testid="media-upload-filled"] img')).toHaveAttribute('src', /blob:/)

    await page.click('[data-testid="color-selector-button"]')

    await page.click('[data-testid="color-picker-toggle"]')

    await expect(page.locator('[data-inkling-card="header"] > div:first-child')).not.toHaveCSS(
      'background-image',
      /blob:/,
    )
    await expect(page.locator('[data-inkling-card="header"] > div:first-child')).toHaveCSS(
      'background-color',
      'rgb(0, 0, 0)',
    )
    await expect(page.locator('[data-testid="media-upload-setting"]')).not.toBeVisible()
  })

  test('can add and remove background image in split layout', async function () {
    const filePath = fixture('large-image.jpeg')
    const fileChooserPromise = page.waitForEvent('filechooser')
    await createHeaderCard({ page })

    await page.click('[data-testid="settings-panel"]')
    await page.waitForSelector('[data-testid="header-layout-split"]')
    await page.locator('[data-testid="header-layout-split"]').click()

    await expect(page.locator('[data-testid="header-background-image-toggle"]')).toHaveCount(0)
    await expect(page.locator('[data-testid="media-upload-setting"]')).not.toBeVisible()

    await page.click('[data-testid="header-card-container"] [data-testid="media-upload-placeholder"]')

    // Set files
    const fileChooser = await fileChooserPromise
    await fileChooser.setFiles([filePath])

    await expect(
      page.locator('[data-testid="header-card-container"] [data-testid="media-upload-filled"] img'),
    ).toHaveAttribute('src', /blob:/)
  })

  test('changes the alignment options from the settings panel', async function () {
    await createHeaderCard({ page })

    // Default: centre alignment
    const header = page.getByTestId('header-heading-editor')
    await expect(header).toHaveClass(/text-center/)

    // Change aligment to left
    const alignmentLeft = page.locator('[data-testid="header-alignment-left"]')
    await alignmentLeft.click()
    await expect(header).not.toHaveClass(/text-center/)
  })

  test('keeps focus on previous editor when changing layout opts', async function () {
    await createHeaderCard({ page })

    // Start editing the header
    await page.locator('[data-inkling-card="header"] [data-inkling="editor"] [contenteditable]').nth(0).fill('')
    await page.keyboard.type('Hello ')

    // Change layout to regular
    await page.locator('[data-testid="header-layout-regular"]').click()

    // Continue editing the header
    await page.keyboard.type('world')

    // Expect header to have 'Hello World'
    const header = page.locator('[data-inkling-card="header"] [data-inkling="editor"]').nth(0)
    await expect(header).toHaveText('Hello world')
  })

  test('keeps focus on previous editor when changing alignment opts', async function () {
    await createHeaderCard({ page })

    // Start editing the subheader
    await page.keyboard.press('Enter')
    await page.locator('[data-inkling-card="header"] [data-inkling="editor"] [contenteditable]').nth(1).fill('')
    await page.keyboard.type('Hello ')

    // Change alignment to center
    await page.locator('[data-testid="header-alignment-center"]').click()

    // Continue editing the subheader
    await page.keyboard.type('world')

    // Expect subheader to have 'Hello World'
    const subheader = page.locator('[data-inkling-card="header"] [data-inkling="editor"]').nth(1)
    await expect(subheader).toHaveText('Hello world')
  })

  test('can swap split layout sides on image', async function () {
    const filePath = fixture('large-image.jpeg')
    await createHeaderCard({ page })
    // Mouse position from earlier test can mean a tooltip is covering the split layout button
    await page.mouse.move(0, 0)
    await page.locator('[data-testid="header-layout-split"]').click()
    await expect(page.locator('[data-testid="header-background-image-toggle"]')).toHaveCount(0)
    // Set files
    const fileChooserPromise = page.waitForEvent('filechooser')
    await page.click('[data-testid="media-upload-placeholder"]')
    const fileChooser = await fileChooserPromise
    await fileChooser.setFiles([filePath])
    await expect(
      page.locator('[data-testid="header-card-container"] [data-testid="media-upload-filled"] img'),
    ).toHaveAttribute('src', /blob:/)
    // Click swap
    await page.click('[data-testid="header-swapped"]')
    // Check the parent class name was updated
    const swappedContainer = page.locator('[data-testid="header-card-content"]')
    await expect(swappedContainer).toHaveClass(/sm:flex-row-reverse/)
  })
  test('can import serialized header card nodes with br', async function () {
    const contentParam = encodeURIComponent(
      JSON.stringify({
        root: {
          children: [
            {
              version: 2,
              type: 'header',
              size: 'small',
              style: 'image',
              buttonEnabled: false,
              buttonUrl: '',
              buttonText: '',
              header: '<span>hello world</span><br /><span>byebye world</span>',
              subheader: '<span>hello sub</span><br /><span>byebye sub</span>',
              backgroundImageSrc: 'blob:http://localhost:5173/fa0956a8-5fb4-4732-9368-18f9d6d8d25a',
              alignment: 'left',
              buttonColor: '#ffffff',
              buttonTextColor: '#000000',
              backgroundColor: 'accent',
              textColor: '#ffffff',
              swapped: false,
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
    await page.waitForSelector('[data-inkling-card="header"]')
    await page.waitForSelector('[data-inkling-card="header"] [data-inkling="editor"]')
    await expect(page.locator('[data-inkling-card="header"] [data-inkling="editor"] p span').nth(0)).toHaveText(
      'hello world',
    )
    await expect(page.locator('[data-inkling-card="header"] [data-inkling="editor"] p br').nth(0)).toBeAttached()
    await expect(page.locator('[data-inkling-card="header"] [data-inkling="editor"] p span').nth(1)).toHaveText(
      'byebye world',
    )
    await expect(page.getByTestId('header-subheader-editor').locator('p span').nth(0)).toHaveText('hello sub')
    await expect(page.getByTestId('header-subheader-editor').locator('p br').nth(0)).toBeAttached()
    await expect(page.getByTestId('header-subheader-editor').locator('p span').nth(1)).toHaveText('byebye sub')
  })
  test('can add a shift-enter to header and subheader', async function () {
    await createHeaderCard({ page })

    await page.keyboard.type('Hello world')
    await page.keyboard.press('Shift+Enter')
    await page.keyboard.type('This is second line')
    await page.keyboard.press('Enter')
    await page.keyboard.type('Hello subheader')
    await page.keyboard.press('Shift+Enter')
    await page.keyboard.type('This is second subheader')
    await page.keyboard.press('Escape')
    await page.waitForSelector('[data-inkling-card-editing="false"]')
    await assertHTML(
      page,
      html` <div
        contenteditable="false"
        role="textbox"
        spellcheck="true"
        data-lexical-editor="true"
        aria-autocomplete="none"
        aria-readonly="true"
      >
        <p dir="ltr">
          <span data-lexical-text="true">Hello world</span>
          <br />
          <span data-lexical-text="true">This is second line</span>
        </p>
      </div>`,
      { selector: '[data-inkling-card="header"] [data-inkling="editor"]' },
    )
    await assertHTML(
      page,
      html` <div
        contenteditable="false"
        role="textbox"
        spellcheck="true"
        data-lexical-editor="true"
        aria-autocomplete="none"
        aria-readonly="true"
      >
        <p dir="ltr">
          <span data-lexical-text="true">Hello subheader</span>
          <br />
          <span data-lexical-text="true">This is second subheader</span>
        </p>
      </div>`,
      { selector: '[data-inkling-card="header"] [data-testid="header-subheader-editor"] [data-inkling="editor"]' },
    )
  })
})
