import { expect, test, type Page } from '@playwright/test'

import { assertHTML, createSnippet, focusEditor, html, initialize, insertCard, loadSerializedState } from '#/utils/e2e'

test.describe('Button Card', () => {
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

  test('can import serialized button card nodes', async function () {
    await loadSerializedState(page, {
      root: {
        children: [
          {
            type: 'button',
            buttonUrl: 'http://someblog.com/somepost',
            buttonText: 'button text',
            alignment: 'center',
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
          <div data-inkling-card-editing="false" data-inkling-card-selected="false" data-inkling-card="button"></div>
        </div>
      `,
      { ignoreCardContents: true },
    )
  })

  test('renders button card', async function () {
    await focusEditor(page)
    await insertCard(page, { cardName: 'button' })

    await assertHTML(
      page,
      html`
        <div data-lexical-decorator="true" contenteditable="false">
          <div data-inkling-card-editing="true" data-inkling-card-selected="true" data-inkling-card="button"></div>
        </div>
        <p><br /></p>
      `,
      { ignoreCardContents: true },
    )
  })

  test('has settings panel', async function () {
    await focusEditor(page)
    await insertCard(page, { cardName: 'button' })

    await expect(page.getByTestId('settings-panel')).toBeVisible()
    await expect(page.getByTestId('button-align-left')).toBeVisible()
    await expect(page.getByTestId('button-align-center')).toBeVisible()
    await expect(page.getByTestId('button-input-text')).toBeVisible()
    await expect(page.getByTestId('button-input-url')).toBeVisible()
  })

  test('alignment buttons work', async function () {
    await focusEditor(page)
    await insertCard(page, { cardName: 'button' })

    // align center by default
    const buttonCard = page.getByTestId('button-card')
    await expect(buttonCard).toHaveClass(/justify-center/)

    const leftAlignButton = page.getByTestId('button-align-left')
    await leftAlignButton.click()
    await expect(buttonCard).toHaveClass(/justify-start/)

    const centerAlignButton = page.getByTestId('button-align-center')
    await centerAlignButton.click()
    await expect(buttonCard).toHaveClass(/justify-center/)
  })

  test('default settings are appropriate', async function () {
    await focusEditor(page)
    await insertCard(page, { cardName: 'button' })

    expect(await page.getByTestId('button-card-btn-span').textContent()).toEqual('Add button text')
    const buttonTextInput = page.getByTestId('button-input-text')
    await expect(buttonTextInput).toHaveAttribute('placeholder', 'Add button text')
    const buttonUrlInput = page.getByTestId('button-input-url')
    await expect(buttonUrlInput).toHaveAttribute('placeholder', 'https://yoursite.com/#/portal/signup/')
  })

  test('text input field works', async function () {
    await focusEditor(page)
    await insertCard(page, { cardName: 'button' })

    // verify default values
    expect(await page.getByTestId('button-card-btn-span').textContent()).toEqual('Add button text')

    const buttonTextInput = page.getByTestId('button-input-text')
    await expect(buttonTextInput).toHaveValue('')

    await page.getByTestId('button-input-text').fill('test')
    await expect(buttonTextInput).toHaveValue('test')
    expect(await page.getByTestId('button-card-btn-span').textContent()).toEqual('test')
  })

  test('url input field works', async function () {
    await focusEditor(page)
    await insertCard(page, { cardName: 'button' })

    const buttonTextInput = page.getByTestId('button-input-url')
    await expect(buttonTextInput).toHaveValue('')

    await page.getByTestId('button-input-url').fill('https://someblog.com/somepost')
    await expect(buttonTextInput).toHaveValue('https://someblog.com/somepost')
    const buttonLink = page.getByTestId('button-card-btn')
    await expect(buttonLink).toHaveAttribute('href', 'https://someblog.com/somepost')
  })

  // NOTE: an improvement would be to pass in suggested url options, but the construction now doesn't make that straightforward
  test('suggested urls display', async function () {
    await focusEditor(page)
    await insertCard(page, { cardName: 'button' })

    const buttonTextInput = page.getByTestId('button-input-url')
    await expect(buttonTextInput).toHaveValue('')

    await page.getByTestId('button-input-url').fill('Home')
    await page.waitForSelector('[data-testid="button-input-url-listOption"]')
    await expect(page.getByTestId('button-input-url-listOption-Homepage')).toHaveText('Homepage')
    await page.getByTestId('button-input-url-listOption').click()

    // need to make this any non-empty string value because we don't want to hardcode the window.location value
    const anyString = /.+/
    await expect(buttonTextInput).toHaveValue(anyString)
    const buttonLink = page.getByTestId('button-card-btn')
    await expect(buttonLink).toHaveAttribute('href', anyString)
  })

  test('can add snippet', async function () {
    await focusEditor(page)
    await insertCard(page, { cardName: 'button' })

    await page.getByTestId('button-input-text').fill('test')

    // create snippet
    await page.keyboard.press('Escape')
    await createSnippet(page)

    // can insert card from snippet
    await page.keyboard.press('Enter')
    await page.keyboard.type('/snippet')
    await expect(page.locator('[data-inkling-cardmenu-selected="true"]').filter({ hasText: 'snippet' })).toBeVisible()
    await page.keyboard.press('Enter')
    await expect(page.locator('[data-inkling-card="button"]')).toHaveCount(2)
  })
})
