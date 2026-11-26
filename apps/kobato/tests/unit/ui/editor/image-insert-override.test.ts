import {
  COMMAND_PRIORITY_HIGH,
  createHeadlessEditor,
  INSERT_CARD_COMMAND,
  INSERT_IMAGE_COMMAND,
  type InsertCardPayload,
  type LexicalEditor,
  OPEN_IMAGE_LIBRARY_COMMAND,
} from '@kobato/inkling'
import { KobatoImageNode } from '@kobato/inkling/host-cards'
import { JSDOM } from 'jsdom'
import { COMMAND_PRIORITY_CRITICAL } from 'lexical'
import { beforeEach, describe, expect, it } from 'vitest'

import { registerKobatoImageInsertCommands } from '@/ui/editor/image-insert-override'

const dom = new JSDOM('')

Object.assign(globalThis, {
  DOMParser: dom.window.DOMParser,
  document: dom.window.document,
  window: dom.window,
})

let editor: LexicalEditor
let captured: InsertCardPayload[]

beforeEach(() => {
  captured = []
  editor = createHeadlessEditor({ nodes: [KobatoImageNode], onError: () => {} })
  editor.registerCommand(
    INSERT_CARD_COMMAND,
    (payload) => {
      captured.push(payload)
      return false
    },
    COMMAND_PRIORITY_CRITICAL,
  )
  registerKobatoImageInsertCommands(editor)
})

describe('registerKobatoImageInsertCommands', () => {
  it('consumes the barrel-exported command priority (the lexical constant, never a hardcoded number)', async () => {
    const { COMMAND_PRIORITY_HIGH: lexicalHigh } = await import('lexical')
    expect(COMMAND_PRIORITY_HIGH).toBe(lexicalHigh)
    expect(COMMAND_PRIORITY_HIGH).toBe(3)
  })

  it('INSERT_IMAGE_COMMAND inserts a KobatoImageNode with the four kobato keys', () => {
    editor.dispatchCommand(INSERT_IMAGE_COMMAND, {
      src: '/storage/posts/cover.png',
      alt: 'cover',
      thumbhash: 'th-abcd',
      storagePath: 'objects/abcdef.png',
      imageId: 'img_1',
    })

    expect(captured).toHaveLength(1)
    const cardNode = captured[0]!.cardNode
    expect(cardNode).toBeInstanceOf(KobatoImageNode)
    const kobato = cardNode as KobatoImageNode
    expect({
      thumbhash: kobato.__thumbhash,
      storagePath: kobato.__storagePath,
      imageId: kobato.__imageId,
      layout: kobato.__layout,
    }).toEqual({ thumbhash: 'th-abcd', storagePath: 'objects/abcdef.png', imageId: 'img_1', layout: 'center' })
    expect(captured[0]!.openPicker).toBeUndefined()
  })

  it('OPEN_IMAGE_LIBRARY_COMMAND inserts an empty KobatoImageNode flagged openPicker (the pick seam trigger)', () => {
    editor.dispatchCommand(OPEN_IMAGE_LIBRARY_COMMAND, {})

    expect(captured).toHaveLength(1)
    const { cardNode, openPicker } = captured[0]!
    expect(cardNode).toBeInstanceOf(KobatoImageNode)
    expect(openPicker).toBe(true)
    expect((cardNode as KobatoImageNode).__thumbhash).toBe('')
  })

  it('the paste/drop leg (initialFile dataset) never carries openPicker', () => {
    const file = new File(['x'], 'x.png', { type: 'image/png' })
    editor.dispatchCommand(INSERT_IMAGE_COMMAND, { initialFile: file })

    expect(captured).toHaveLength(1)
    expect(captured[0]!.openPicker).toBeUndefined()
  })
})
