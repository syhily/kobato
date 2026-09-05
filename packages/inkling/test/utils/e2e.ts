import type { EditorState, LexicalEditor } from 'lexical'
import type { NavigateFunction } from 'react-router-dom'

import { expect, type Locator, type Page } from '@playwright/test'
import prettier from '@prettier/sync'
import jsdom from 'jsdom'
import fs from 'node:fs'
import path from 'node:path'

declare global {
  interface Window {
    // set by initialize() → exposeLexicalEditor before any test body runs;
    // declared non-optional so evaluate callbacks don't each re-narrow
    lexicalEditor: LexicalEditor
    navigate?: NavigateFunction
    originalEditorState: EditorState
  }
}

const { JSDOM } = jsdom
const browserCtrlOrCmdMap = new WeakMap<Page, 'Control' | 'Meta'>()

// start-case helper: 'call-to-action' -> 'Call To Action'
function startCase(str: string): string {
  return str
    .split(/[\s_-]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export async function initialize({
  page,
  uri = '/#/?content=false',
  force = false,
}: {
  page: Page
  uri?: string
  force?: boolean
}) {
  const currentViewportSize = page.viewportSize()
  if (currentViewportSize === null || currentViewportSize.width !== 1000 || currentViewportSize.height !== 1000) {
    await page.setViewportSize({ width: 1000, height: 1000 })
  }

  const currentUrl = page.url()
  if (currentUrl === 'about:blank') {
    // First page load
    await page.goto(uri)

    await page.waitForSelector('.inkling-lexical')

    await exposeLexicalEditor(page)
  } else {
    // Subsequent pages navigated to using react router
    const targetUrl = new URL(uri, currentUrl).href
    const navigationRequest: [string, boolean] = [uri.slice(2), force || currentUrl === targetUrl]
    await page.evaluate(async ([navigateTo, shouldForce]: [string, boolean]) => {
      const navigate = window.navigate
      if (!navigate) {
        throw new Error('Expected the demo Navigator to expose window.navigate')
      }

      window.lexicalEditor.blur()
      window.lexicalEditor.setEditorState(window.originalEditorState)

      if (shouldForce) {
        // Purposefully navigate away from the current page to ensure component is reloaded
        void navigate('/404')
        await new Promise<void>((resolve) => {
          setTimeout(() => {
            // Navigate in a task to ensure React Router cannot optimise out our first navigation
            void navigate(navigateTo)
            resolve()
          }, 10)
        })
      } else {
        await navigate(navigateTo)
      }
    }, navigationRequest)
    await exposeLexicalEditor(page)
  }

  browserCtrlOrCmdMap.set(
    page,
    await page.evaluate(() => {
      return navigator.platform.includes('Mac') ? 'Meta' : 'Control'
    }),
  )
}

async function exposeLexicalEditor(page: Page) {
  await page.waitForSelector('[data-lexical-editor]')
  await page.evaluate(() => {
    const rootElement = document.querySelector<HTMLElement & { __lexicalEditor?: LexicalEditor }>(
      '[data-lexical-editor]',
    )
    const editor = rootElement?.__lexicalEditor
    if (!editor) {
      throw new Error('Expected the Lexical root element to expose its editor instance')
    }

    window.lexicalEditor = editor
    window.originalEditorState = editor.getEditorState()
  })
}

export async function focusEditor(page: Page, parentSelector = '.inkling-lexical') {
  const selector = `${parentSelector} div[contenteditable="true"]`
  await page.focus(selector)
}

// Lexical's history plugin merges consecutive same-type changes that happen
// within 1000ms of each other (@lexical/history merge delay). Tests that need
// the next change to become its own undo group must wait this window out.
// This documents a Lexical behavioral constant — re-verify on Lexical upgrades
// (0.46 changed history behavior once already; commits 33a23bf, 3a4c109).
export const HISTORY_MERGE_WINDOW_MS = 1000

export async function waitForHistoryGroupBoundary(page: Page) {
  // 200ms of slack on top of the merge window so timing jitter on loaded CI
  // runners cannot land the next change inside the previous undo group.
  await page.waitForTimeout(HISTORY_MERGE_WINDOW_MS + 200)
}

// Waits until the editor has been update-silent for the full history merge
// window. Stronger than waitForHistoryGroupBoundary: that one only waits a
// fixed wall-clock span from the last keystroke, so a straggler update
// (debounced card-content sync, late React effect) can still commit after it
// — landing ABOVE the next change's entry on the undo stack, which a later
// undo then pops instead of the intended one. Here the window re-arms on
// every update, so it only ends once the stack has truly settled and the
// merge window has elapsed since the last commit. The cap keeps a chatty
// editor from hanging the test; on cap the wait is best-effort.
// Waits until the editor (and every nested card editor reachable through the
// node map) has been update-silent for the full history merge window.
// Stronger than waitForHistoryGroupBoundary: that one only waits a fixed
// wall-clock span from the last keystroke, so a straggler update (debounced
// card-content sync, late React effect) can still commit after it — landing
// ABOVE the next change's entry on the undo stack, which a later undo then
// pops instead of the intended one. The nested editors matter too: the
// shared undo stack's merge bookkeeping is per-editor, but a nested editor's
// selection-only update can still rewrite the shared `current` entry
// (upstream merges `!hasDirtyNodes && selection !== null` updates without an
// isSameEditor check) — a late nested update right before a card deletion
// pollutes the deletion's undo entry, so undo restores a pre-deletion state
// with the wrong selection (the toggle undo/redo e2e flake). The window
// re-arms on every update from any of those editors and only ends once all
// have been silent past the merge window; the cap keeps a chatty editor from
// hanging the test, on cap the wait is best-effort.
export async function waitForEditorQuiet(page: Page, quietMs = HISTORY_MERGE_WINDOW_MS + 200, capMs = 8000) {
  await page.evaluate(
    ([quiet, cap]) => {
      const editors = new Set<{ registerUpdateListener: (listener: () => void) => () => void }>()
      const main = window.lexicalEditor
      editors.add(main)
      main.getEditorState().read(() => {
        const nodeMap = (main as unknown as { _editorState: { _nodeMap: Map<string, unknown> } })._editorState._nodeMap
        for (const node of nodeMap.values()) {
          const record = node as Record<string, unknown>
          for (const key of Object.keys(record)) {
            const value = record[key]
            if (value && typeof value === 'object' && 'registerUpdateListener' in value) {
              editors.add(value as { registerUpdateListener: (listener: () => void) => () => void })
            }
          }
        }
      })

      const unregister: Array<() => void> = []
      let lastActivity = performance.now()
      for (const editor of editors) {
        unregister.push(
          editor.registerUpdateListener(() => {
            lastActivity = performance.now()
          }),
        )
      }

      const quieted = new Promise<void>((resolveQuiet) => {
        const timer = setInterval(() => {
          if (performance.now() - lastActivity >= quiet) {
            clearInterval(timer)
            resolveQuiet()
          }
        }, 50)
      })
      const capped = new Promise<void>((resolveCap) => {
        setTimeout(resolveCap, cap)
      })
      return Promise.race([quieted, capped]).then(() => {
        unregister.forEach((detach) => detach())
      })
    },
    [quietMs, capMs] as const,
  )
}

// CodeMirror groups transactions that occur within 500ms into a single undo
// group (history newGroupDelay). Wait it out so the next change is undoable
// on its own.
export const CODEMIRROR_HISTORY_GROUP_DELAY_MS = 500

export async function waitForCodeMirrorHistoryGroup(page: Page) {
  await page.waitForTimeout(CODEMIRROR_HISTORY_GROUP_DELAY_MS + 200)
}

// Waits until a nested card editor's content has rendered into the card DOM.
// Card nodes read their nested editors live in exportJSON(), so polling the
// editor-state JSON can't observe the propagation — the DOM is the honest
// signal that React committed the nested editor's latest update. Replaces
// fixed sleeps that let the nested editor settle so the following keystrokes
// aren't batched into the same update as the typing.
export async function waitForCardContentSynced(page: Page, cardName: string, text: string) {
  await expect(page.locator(`[data-inkling-card="${cardName}"]`)).toContainText(text)
  // flush pending Lexical updates / React effects (double rAF)
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve()
          })
        })
      }),
  )
}

interface AssertHTMLOptions {
  selector?: string
  ignoreClasses?: boolean
  ignoreInlineStyles?: boolean
  ignoreInnerSVG?: boolean
  getBase64FileFormat?: boolean
  ignoreCardContents?: boolean
  ignoreCardSettings?: boolean
  ignoreCardToolbarContents?: boolean
  ignoreDragDropAttrs?: boolean
  ignoreDataTestId?: boolean
  ignoreCardCaptionContents?: boolean
}

export async function assertHTML(
  page: Page,
  expectedHtml: string,
  {
    selector = 'div[contenteditable="true"]',
    ignoreClasses = true,
    ignoreInlineStyles = true,
    ignoreInnerSVG = true,
    getBase64FileFormat = true,
    ignoreCardContents = false,
    ignoreCardSettings = false,
    ignoreCardToolbarContents = false,
    ignoreDragDropAttrs = true,
    ignoreDataTestId = true,
    ignoreCardCaptionContents = false,
  }: AssertHTMLOptions = {},
) {
  // one binding for both sides — an option added to only one side would
  // silently compare mismatched normalizations
  const prettyOptions = {
    ignoreClasses,
    ignoreInlineStyles,
    ignoreInnerSVG,
    getBase64FileFormat,
    ignoreCardContents,
    ignoreCardSettings,
    ignoreCardToolbarContents,
    ignoreDragDropAttrs,
    ignoreDataTestId,
    ignoreCardCaptionContents,
  }
  const actualHtml = await page.$eval(selector, (e) => e.innerHTML)
  const actual = prettifyHTML(actualHtml.replace(/\n/gm, ''), prettyOptions)
  const expected = prettifyHTML(expectedHtml.replace(/\n/gm, ''), prettyOptions)
  expect(actual).toEqual(expected)
}

export function prettifyHTML(string: string, options: Omit<AssertHTMLOptions, 'selector'> = {}) {
  let output = string

  if (options.ignoreInnerSVG) {
    output = output.replace(/<svg[^>]*>.*?<\/svg>/g, '<svg></svg>')
  }

  if (options.getBase64FileFormat) {
    output = output.replace(/(^|[\s">])data:([^;]*);([^"]*),([^"]*)/g, '$1data:$2;$3,BASE64DATA')
  }

  if (options.ignoreDragDropAttrs) {
    output = output.replace(/data-inkling-dnd-.*?=".*?"/g, '')
  }

  // replace all instances of blob:http with "blob:..."
  output = output.replace(/blob:http[^"]*/g, 'blob:...')

  // perform these replacements before class and testid removal so we can use them in selectors
  if (
    options.ignoreCardContents ||
    options.ignoreCardToolbarContents ||
    options.ignoreCardCaptionContents ||
    options.ignoreCardSettings
  ) {
    const { document } = new JSDOM(output).window

    const querySelectors = []
    if (options.ignoreCardContents) {
      querySelectors.push('[data-inkling-card]')
    }
    if (options.ignoreCardToolbarContents) {
      querySelectors.push('[data-inkling-card-toolbar]')
    }
    if (options.ignoreCardCaptionContents) {
      querySelectors.push('figcaption')
    }
    if (options.ignoreCardSettings) {
      querySelectors.push('[data-testid="settings-panel"]')
    }

    document.querySelectorAll(querySelectors.join(', ')).forEach((element) => {
      element.innerHTML = ''
    })
    output = document.body.innerHTML
  }

  if (options.ignoreClasses) {
    output = output.replace(/\sclass="([^"]*)"/g, '')
  }

  if (options.ignoreDataTestId) {
    output = output.replace(/\sdata-testid="([^"]*)"/g, '')
  }

  if (options.ignoreInlineStyles) {
    output = output.replace(/\sstyle="([^"]*)"/g, '')
  }

  // Normalize direction attributes. Lexical 0.46 defaults to dir="auto" on
  // root-level elements, but the test suite was written against earlier
  // behavior where direction was either absent or "ltr". Stripping dir from
  // both sides keeps the assertions focused on structure and content.
  output = output.replace(/\sdir="([^"]*)"/g, '')

  // Normalize Lexical 0.46 managed line-break markers.
  output = output.replace(/<br\s+data-lexical-managed-linebreak="true"\s*\/?\s*>/g, '<br />')

  return prettier
    .format(output, {
      attributeGroups: ['$DEFAULT', '^data-'],
      attributeSort: 'ASC',
      bracketSameLine: true,
      htmlWhitespaceSensitivity: 'ignore',
      parser: 'html',
      plugins: ['prettier-plugin-organize-attributes'],
    })
    .trim()
}

export function prettifyJSON(string: string) {
  let output = string

  // replace urls inside markdown links
  output = output.replace(/\(blob:http[^"]*\)/g, '(blob:...)')
  // replace any other urls
  output = output.replace(/blob:http[^"]*/g, 'blob:...')

  return prettier.format(output, {
    parser: 'json',
  })
}

// Tagged-template passthrough: joins the partials and params back into a
// plain string. It exists so prettier's embedded-language formatting treats
// the template's contents as HTML
// (https://prettier.io/blog/2020/08/24/2.1.0.html#api)
export function html(partials: TemplateStringsArray, ...params: unknown[]) {
  let output = ''
  for (let i = 0; i < partials.length; i++) {
    output += partials[i]
    if (i < partials.length - 1) {
      output += params[i]
    }
  }
  return output
}

interface ExpectedSelection {
  anchorOffset: number | readonly [number, number]
  anchorPath: number[]
  focusOffset: number | readonly [number, number]
  focusPath: number[]
}

export async function assertSelection(page: Page, expected: ExpectedSelection) {
  // Assert the selection of the editor matches the snapshot
  const selection = await page.evaluate(() => {
    const rootElement = document.querySelector('div[contenteditable="true"]')

    const getPathFromNode = (startNode: Node | null) => {
      const path: number[] = []
      if (startNode === rootElement) {
        return []
      }
      let current: Node | null = startNode
      while (current !== null) {
        const parent = current.parentNode
        if (parent === null || current === rootElement) {
          break
        }
        path.push(Array.from(parent.childNodes).findIndex((child) => child === current))
        current = parent
      }
      return path.reverse()
    }

    const browserSelection = window.getSelection()
    if (!browserSelection) {
      throw new Error('Expected the browser to expose an active selection')
    }

    const { anchorNode, anchorOffset, focusNode, focusOffset } = browserSelection

    return {
      anchorOffset,
      anchorPath: getPathFromNode(anchorNode),
      focusOffset,
      focusPath: getPathFromNode(focusNode),
    }
  })

  expect(selection.anchorPath).toEqual(expected.anchorPath)

  if (Array.isArray(expected.anchorOffset)) {
    const [start, end] = expected.anchorOffset
    expect(selection.anchorOffset).toBeGreaterThanOrEqual(start)
    expect(selection.anchorOffset).toBeLessThanOrEqual(end)
  } else {
    expect(selection.anchorOffset).toEqual(expected.anchorOffset)
  }

  expect(selection.focusPath).toEqual(expected.focusPath)

  if (Array.isArray(expected.focusOffset)) {
    const [start, end] = expected.focusOffset
    expect(selection.focusOffset).toBeGreaterThanOrEqual(start)
    expect(selection.focusOffset).toBeLessThanOrEqual(end)
  } else {
    expect(selection.focusOffset).toEqual(expected.focusOffset)
  }
}

export async function assertPosition(
  page: Page,
  selector: string,
  expectedBox: Partial<Pick<BoundingBox, 'x' | 'y'>>,
  { threshold = 0 }: { threshold?: number } = {},
) {
  const assertedElem = await page.$(selector)
  if (!assertedElem) {
    throw new Error(`Expected an element matching ${selector}`)
  }

  const assertedBox = await assertedElem.boundingBox()
  if (!assertedBox) {
    throw new Error(`Expected an element matching ${selector} to have a bounding box`)
  }

  const boxProperties: Array<'x' | 'y'> = ['x', 'y']
  boxProperties.forEach((boxProperty) => {
    const expectedPosition = expectedBox[boxProperty]
    if (expectedPosition !== undefined) {
      expect(assertedBox[boxProperty], boxProperty).toBeGreaterThanOrEqual(expectedPosition - threshold)
      expect(assertedBox[boxProperty], boxProperty).toBeLessThanOrEqual(expectedPosition + threshold)
    }
  })
}

export async function getEditorStateJSON(page: Page) {
  const json = await page.evaluate(() => {
    const rootElement = document.querySelector<HTMLElement & { __lexicalEditor?: LexicalEditor }>(
      'div[contenteditable="true"]',
    )
    const editor = rootElement?.__lexicalEditor
    if (!editor) {
      throw new Error('Expected the editable root to expose its Lexical editor instance')
    }

    return JSON.stringify(editor.getEditorState().toJSON())
  })

  return json
}

export async function assertRootChildren(page: Page, expectedState: string) {
  const state = await getEditorStateJSON(page)
  const actualState = JSON.stringify(JSON.parse(state).root.children)

  const actual = prettifyJSON(actualState)
  const expected = prettifyJSON(expectedState)

  expect(actual).toEqual(expected)
}

/** Replace the document with a serialized editor state (a JSON string, or a state object serialized here). */
export async function loadSerializedState(page: Page, state: string | object) {
  const serialized = typeof state === 'string' ? state : JSON.stringify(state)
  await page.evaluate((text) => {
    const editor = window.lexicalEditor
    editor.setEditorState(editor.parseEditorState(text))
  }, serialized)
}

export type BoundingBox = NonNullable<Awaited<ReturnType<Locator['boundingBox']>>>

/** The locator's bounding box, or a thrown expectation — the null-narrowing lives here, not per call site. */
export async function getBoundingBox(locator: Locator): Promise<BoundingBox> {
  const boundingBox = await locator.boundingBox()
  if (boundingBox === null) {
    throw new Error('Expected the locator to be visible')
  }
  return boundingBox
}

export async function paste(page: Page, data: Record<string, string>) {
  const setDataCommands = Object.keys(data).map((mimeType) => {
    return `
            dataTransfer.setData('${mimeType}', ${JSON.stringify(data[mimeType])});
        `
  })

  const pasteCommand = `
        const dataTransfer = new DataTransfer();

        ${setDataCommands.join('\n')};

        const activeElement = document.activeElement;
        if (!activeElement) {
            throw new Error('Expected an active element before pasting');
        }

        activeElement.dispatchEvent(new ClipboardEvent('paste', {
            clipboardData: dataTransfer,
            bubbles: true,
            cancelable: true
        }));

        dataTransfer.clearData();
    `

  await page.evaluate(pasteCommand)
}

export async function pasteText(page: Page, content: string) {
  await paste(page, { 'text/plain': content })
}

export async function pasteHtml(page: Page, content: string) {
  await paste(page, { 'text/html': content })
}

export async function pasteLexical(page: Page, content: string) {
  await paste(page, { 'application/x-lexical-editor': content })
}

export async function pasteFiles(page: Page, files: readonly FilePathPayload[]) {
  await pasteFilesWithText(page, files)
}

/** Absolute path to a file in test/e2e/fixtures (subdirectories allowed: 'paste/office-com-headings.html'). */
export function fixture(name: string): string {
  return path.resolve(import.meta.dirname, '../e2e/fixtures', name)
}

/** A pasteFiles payload for a fixture file: the path resolved, the fileName taken from the fixture's base name. */
export function fixtureFile(name: string, fileType: string): FilePathPayload {
  return { filePath: fixture(name), fileName: path.basename(name), fileType }
}

/** Paste fixture files: one name + MIME type per entry, the path resolution and payload shape stay here. */
export async function pasteFixtureFiles(page: Page, files: ReadonlyArray<{ name: string; fileType: string }>) {
  await pasteFiles(
    page,
    files.map(({ name, fileType }) => fixtureFile(name, fileType)),
  )
}

export async function pasteFilesWithText(
  page: Page,
  files: readonly FilePathPayload[],
  text: Record<string, string> = {},
) {
  const dataTransfer = await createDataTransfer(page, files)

  await page.evaluate(
    async ({ clipboardData, textData }) => {
      Object.keys(textData).forEach((mimeType) => {
        clipboardData.setData(mimeType, textData[mimeType])
      })

      const activeElement = document.activeElement
      if (!activeElement) {
        throw new Error('Expected an active element before pasting files')
      }

      activeElement.dispatchEvent(
        new ClipboardEvent('paste', {
          clipboardData: clipboardData,
          bubbles: true,
          cancelable: true,
        }),
      )

      clipboardData.clearData()
    },
    { clipboardData: dataTransfer, textData: text },
  )
}

export async function dragMouse(
  page: Page,
  fromBoundingBox: BoundingBox,
  toBoundingBox: BoundingBox,
  positionStart: BoundingBoxPosition = 'middle',
  positionEnd: BoundingBoxPosition = 'middle',
  mouseUp = true,
  hover = 0,
  steps = 1,
) {
  let fromX = fromBoundingBox.x
  let fromY = fromBoundingBox.y
  if (positionStart === 'middle') {
    fromX += fromBoundingBox.width / 2
    fromY += fromBoundingBox.height / 2
  } else if (positionStart === 'end') {
    fromX += fromBoundingBox.width
    fromY += fromBoundingBox.height
  }
  await page.mouse.move(fromX, fromY)
  await page.mouse.down()

  let toX = toBoundingBox.x
  let toY = toBoundingBox.y
  if (positionEnd === 'middle') {
    toX += toBoundingBox.width / 2
    toY += toBoundingBox.height / 2
  } else if (positionEnd === 'end') {
    toX += toBoundingBox.width
    toY += toBoundingBox.height
  }

  await page.mouse.move(toX, toY, { steps: steps })

  if (hover > 0) {
    await page.waitForTimeout(hover)
  }

  if (mouseUp) {
    await page.mouse.up()
  }
}

export function isMac(): boolean {
  // issue https://github.com/microsoft/playwright/issues/12168
  return process.platform === 'darwin'
}

export function ctrlOrCmd(page: Page) {
  const modifier = browserCtrlOrCmdMap.get(page)

  if (!modifier) {
    throw new Error('ctrlOrCmd(page) requires initialize({page}) before use')
  }

  return modifier
}

// note: we always use lowercase for the cardName but we use start case for the menu item attribute
/** Insert a card whose insert flow opens a file chooser, and answer the chooser with the given file path(s). */
export async function insertCardWithUpload(
  page: Page,
  { cardName, files, nth = 0 }: { cardName: string; files: string | readonly string[]; nth?: number },
) {
  const [fileChooser] = await Promise.all([page.waitForEvent('filechooser'), insertCard(page, { cardName, nth })])
  await fileChooser.setFiles(files)
}

export async function insertCard(page: Page, { cardName, nth = 0 }: { cardName: string; nth?: number }) {
  let card = startCase(cardName)
  await page.keyboard.type(`/${cardName}`)
  await expect(
    page.locator(`[data-inkling-card-menu-item="${card}" i][data-inkling-cardmenu-selected="true"]`),
  ).toBeVisible()
  await page.keyboard.press('Enter')
  // hr is the one case we don't match the card name to the data attribute
  if (card === 'Divider') {
    await expect(page.locator(`[data-inkling-card="horizontalrule"]`).nth(nth)).toBeVisible()
    return page.locator(`[data-inkling-card="horizontalrule"]`).nth(nth)
  } else {
    await expect(page.locator(`[data-inkling-card="${cardName}" i]`).nth(nth)).toBeVisible()
    return page.locator(`[data-inkling-card="${cardName}" i]`).nth(nth)
  }
}

export async function createSnippet(page: Page) {
  await page.waitForSelector('[data-testid="create-snippet"]')
  // Small wait for toolbar to stabilize after card state transitions
  // (React re-renders can detach and re-mount toolbar elements)
  await page.waitForTimeout(50)
  await page.getByTestId('create-snippet').click()
  await page.getByTestId('snippet-name').fill('snippet')
  await page.keyboard.press('Enter')
}

export async function getScrollPosition(page: Page) {
  return page.evaluate(() => {
    const scrollContainer = document.querySelector<HTMLElement>('.h-full.overflow-auto')
    if (!scrollContainer) {
      throw new Error('Expected the editor scroll container')
    }

    return scrollContainer.scrollTop
  })
}

export async function enterUntilScrolled(page: Page) {
  let scrollPosition = 0

  while (scrollPosition === 0) {
    await page.keyboard.type('hello\nhello\nhello\nhello\nhello\nhello')
    await page.keyboard.press('Enter')

    // Get scroll position
    scrollPosition = await getScrollPosition(page)
  }
}

export async function expectUnchangedScrollPosition(page: Page, wrapper: () => Promise<void>) {
  const start = await getScrollPosition(page)
  await wrapper()
  const end = await getScrollPosition(page)
  expect(start).toEqual(end)
}

type BoundingBoxPosition = 'end' | 'middle' | 'start'

export interface FilePathPayload {
  fileName: string
  filePath: string
  fileType: string
}

interface SerializedFilePayload {
  buffer: number[]
  name: string
  type: string
}

export async function createDataTransfer(page: Page, data: readonly FilePathPayload[] = []) {
  const filesData: SerializedFilePayload[] = data.map((file) => {
    const buffer = fs.readFileSync(file.filePath)

    return {
      buffer: buffer.toJSON().data,
      name: file.fileName,
      type: file.fileType,
    }
  })

  return page.evaluateHandle((dataset: SerializedFilePayload[]) => {
    const dt = new DataTransfer()

    dataset.forEach((fileData) => {
      const file = new File([new Uint8Array(fileData.buffer)], fileData.name, { type: fileData.type })
      dt.items.add(file)
    })

    return dt
  }, filesData)
}

export async function getEditorState(page: Page) {
  return page.evaluate(() => {
    return window.lexicalEditor.getEditorState().toJSON()
  })
}

/**
 * Select text backwards from current cursor position by the given number of characters.
 * Uses keyboard Shift+ArrowLeft with a short wait to ensure Chrome for Testing
 * registers the selection correctly before subsequent keyboard actions.
 */
export async function selectBackwards(page: Page, charCount: number) {
  await page.keyboard.down('Shift')
  for (let i = 0; i < charCount; i++) {
    await page.keyboard.press('ArrowLeft')
  }
  await page.keyboard.up('Shift')
  // Wait for selection to be registered in Chrome for Testing before keyboard actions
  await page.waitForTimeout(50)
}

/**
 * Select text forwards from current cursor position by the given number of characters.
 * Uses keyboard Shift+ArrowRight with a short wait to ensure Chrome for Testing
 * registers the selection correctly before subsequent keyboard actions.
 */
export async function selectForward(page: Page, charCount: number) {
  await page.keyboard.down('Shift')
  for (let i = 0; i < charCount; i++) {
    await page.keyboard.press('ArrowRight')
  }
  await page.keyboard.up('Shift')
  // Wait for selection to be registered in Chrome for Testing before keyboard actions
  await page.waitForTimeout(50)
}
