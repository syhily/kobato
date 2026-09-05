import {
  $createParagraphNode,
  $createTextNode,
  $getNodeByKey,
  $getRoot,
  $isParagraphNode,
  $isTextNode,
  createEditor,
  HISTORIC_TAG,
  HISTORY_MERGE_TAG,
  HISTORY_PUSH_TAG,
  type LexicalEditor,
  type NodeKey,
} from 'lexical'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { drainEnqueuedUpdates } from '#/utils/test-editor'
import { registerUpdateScan, type UpdateScanOptions } from '@/plugins/behaviour/update-scan'

// Unit pins for the update-scan registration policy (@/plugins/behaviour/update-scan)
// that EmEnDashPlugin and HorizontalRulePlugin now delegate to: the
// history-tag skip (the undo-resurrection guard), the empty-dirty skip in
// both dirty modes, the composing skip, and the tagged-vs-untagged nested
// scan commit. The plugins' own tests keep pinning the per-plugin scan
// bodies; only the shared gate is pinned here.

function createTestEditor(): LexicalEditor {
  return createEditor({
    namespace: 'test',
    onError: () => {},
  })
}

describe('registerUpdateScan', () => {
  let editor: LexicalEditor
  let textKey: NodeKey

  beforeEach(async () => {
    editor = createTestEditor()
    await drainEnqueuedUpdates(editor, () => {
      const paragraph = $createParagraphNode()
      const text = $createTextNode('initial')
      paragraph.append(text)
      $getRoot().append(paragraph)
      text.select()
      textKey = text.getKey()
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function registerScan(options: Partial<UpdateScanOptions> = {}) {
    const scan = vi.fn<UpdateScanOptions['scan']>()
    const cleanup = registerUpdateScan(editor, { dirty: 'leaves', scan, ...options })
    return { scan, cleanup }
  }

  function dirtyTheText(text: string) {
    const node = $getNodeByKey(textKey)
    if ($isTextNode(node)) {
      node.setTextContent(text)
    }
  }

  it.each([HISTORIC_TAG, HISTORY_PUSH_TAG, HISTORY_MERGE_TAG])('skips commits tagged %s', async (tag) => {
    const { scan } = registerScan()

    await drainEnqueuedUpdates(editor, () => dirtyTheText('changed'), { tag })

    expect(scan).not.toHaveBeenCalled()
  })

  it('fires the scan on a clean typing commit, with the triggering commit’s dirty sets', async () => {
    const { scan } = registerScan()

    await drainEnqueuedUpdates(editor, () => dirtyTheText('changed'))

    expect(scan).toHaveBeenCalledTimes(1)
    const [dirtyLeaves] = scan.mock.calls[0] ?? []
    expect(dirtyLeaves?.has(textKey)).toBe(true)
  })

  it('skips selection-only commits in leaves mode', async () => {
    const { scan } = registerScan({ dirty: 'leaves' })

    await drainEnqueuedUpdates(editor, () => {
      const paragraph = $getRoot().getFirstChild()
      if ($isParagraphNode(paragraph)) {
        paragraph.select(0, 0)
      }
    })

    expect(scan).not.toHaveBeenCalled()
  })

  it('skips selection-only commits in leaves-or-elements mode', async () => {
    const { scan } = registerScan({ dirty: 'leaves-or-elements' })

    await drainEnqueuedUpdates(editor, () => {
      const paragraph = $getRoot().getFirstChild()
      if ($isParagraphNode(paragraph)) {
        paragraph.select(0, 0)
      }
    })

    expect(scan).not.toHaveBeenCalled()
  })

  it('skips element-only commits in leaves mode', async () => {
    const { scan } = registerScan({ dirty: 'leaves' })

    // appending an empty paragraph dirties root (element) and no leaf
    await drainEnqueuedUpdates(editor, () => {
      $getRoot().append($createParagraphNode())
    })

    expect(scan).not.toHaveBeenCalled()
  })

  it('fires on element-only commits in leaves-or-elements mode', async () => {
    const { scan } = registerScan({ dirty: 'leaves-or-elements' })

    await drainEnqueuedUpdates(editor, () => {
      $getRoot().append($createParagraphNode())
    })

    expect(scan).toHaveBeenCalledTimes(1)
    const [dirtyLeaves, dirtyElements] = scan.mock.calls[0] ?? []
    expect(dirtyLeaves?.size).toBe(0)
    expect(dirtyElements?.size).toBeGreaterThan(0)
  })

  it('skips while composing, and fires again once composition ends', async () => {
    vi.spyOn(editor, 'isComposing').mockReturnValue(true)
    const { scan } = registerScan()

    await drainEnqueuedUpdates(editor, () => dirtyTheText('composing'))

    expect(scan).not.toHaveBeenCalled()

    vi.restoreAllMocks()

    await drainEnqueuedUpdates(editor, () => dirtyTheText('done'))

    expect(scan).toHaveBeenCalledTimes(1)
  })

  it('commits the scan with the configured tag and does not re-fire on its own tagged commit', async () => {
    const passes: string[][] = []
    editor.registerUpdateListener(({ tags }) => {
      passes.push([...tags])
    })
    // a scan body that dirties a node, so its own tagged commit would
    // re-trigger the gate were the history-push skip not in place
    const { scan } = registerScan({ tag: HISTORY_PUSH_TAG })
    scan.mockImplementation((dirtyLeaves) => {
      dirtyLeaves.forEach((key) => {
        const node = $getNodeByKey(key)
        if ($isTextNode(node)) {
          // a real mutation (setTextContent short-circuits on identical
          // text): the tagged scan commit dirties the node and fires a
          // listener pass of its own
          node.setTextContent(node.getTextContent() + '!')
        }
      })
    })

    await drainEnqueuedUpdates(editor, () => dirtyTheText('changed'))

    expect(scan).toHaveBeenCalledTimes(1)
    // the trigger commit is untagged; the scan’s own commit carries the tag
    expect(passes.some((tags) => tags.includes(HISTORY_PUSH_TAG))).toBe(true)
    expect(passes[0]).not.toContain(HISTORY_PUSH_TAG)
  })

  it('commits the scan untagged when no tag is configured', async () => {
    const passes: string[][] = []
    editor.registerUpdateListener(({ tags }) => {
      passes.push([...tags])
    })
    const { scan } = registerScan()

    await drainEnqueuedUpdates(editor, () => dirtyTheText('changed'))

    expect(scan).toHaveBeenCalledTimes(1)
    expect(passes.flat().every((tag) => !tag.startsWith('history'))).toBe(true)
  })

  it('stops firing once unregistered', async () => {
    const { scan, cleanup } = registerScan()
    cleanup()

    await drainEnqueuedUpdates(editor, () => dirtyTheText('changed'))

    expect(scan).not.toHaveBeenCalled()
  })
})
