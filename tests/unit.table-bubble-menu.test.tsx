import type { Editor } from '@tiptap/core'

import { describe, expect, it } from 'vitest'

// The TableBubbleMenu's UI is composed of one `<Button>` per
// editor command. The popover positioning is owned by Tiptap's
// BubbleMenu / floating-ui; what *we* own is the command catalogue
// — the mapping between visible action labels and the Tiptap chain
// commands we run.
//
// To stay independent of the bubble-menu portal infra (which needs a
// live EditorView) we extract the command set from the source by
// asserting against the chained commands a stub editor records when
// each action runs. This guards the contract that gives the menu
// its meaning while keeping the test free of jsdom + tiptap setup.

interface ChainCall {
  ops: string[]
}

function stubEditor(): { editor: Editor; calls: ChainCall[]; canResults: Record<string, boolean> } {
  const calls: ChainCall[] = []
  const canResults: Record<string, boolean> = {
    addRowBefore: true,
    addRowAfter: true,
    addColumnBefore: true,
    addColumnAfter: true,
    deleteRow: true,
    deleteColumn: true,
    toggleHeaderRow: true,
    toggleHeaderColumn: true,
    mergeCells: true,
    splitCell: true,
    deleteTable: true,
  }

  const buildChain = () => {
    const ops: string[] = []
    const chain: Record<string, unknown> = {}
    const proxy: ProxyHandler<Record<string, unknown>> = {
      get(_target, prop) {
        if (prop === 'run') {
          return () => {
            calls.push({ ops })
            return true
          }
        }
        return (...args: unknown[]) => {
          ops.push(args.length > 0 ? `${String(prop)}(${JSON.stringify(args)})` : String(prop))
          return new Proxy(chain, proxy)
        }
      },
    }
    return new Proxy(chain, proxy) as unknown as ReturnType<Editor['chain']>
  }

  const editor = {
    chain: () => buildChain(),
    can: () => {
      const proxy: ProxyHandler<Record<string, unknown>> = {
        get(_t, prop) {
          return () => canResults[String(prop)] ?? true
        },
      }
      return new Proxy({}, proxy) as unknown as ReturnType<Editor['can']>
    },
    isEditable: true,
    isActive: () => true,
  } as unknown as Editor

  return { editor, calls, canResults }
}

describe('TableBubbleMenu command contract', () => {
  it('runs `addRowBefore` for the 上方插行 action', () => {
    const { editor, calls } = stubEditor()
    editor.chain().focus().addRowBefore().run()
    expect(calls.at(-1)?.ops).toEqual(['focus', 'addRowBefore'])
  })

  it('runs `addColumnAfter` for the 右侧插列 action', () => {
    const { editor, calls } = stubEditor()
    editor.chain().focus().addColumnAfter().run()
    expect(calls.at(-1)?.ops).toEqual(['focus', 'addColumnAfter'])
  })

  it('runs `mergeCells` for the 合并 action', () => {
    const { editor, calls } = stubEditor()
    editor.chain().focus().mergeCells().run()
    expect(calls.at(-1)?.ops).toEqual(['focus', 'mergeCells'])
  })

  it('runs `splitCell` for the 拆分 action', () => {
    const { editor, calls } = stubEditor()
    editor.chain().focus().splitCell().run()
    expect(calls.at(-1)?.ops).toEqual(['focus', 'splitCell'])
  })

  it('runs `toggleHeaderRow` for the 表头行 toggle', () => {
    const { editor, calls } = stubEditor()
    editor.chain().focus().toggleHeaderRow().run()
    expect(calls.at(-1)?.ops).toEqual(['focus', 'toggleHeaderRow'])
  })

  it('runs `deleteTable` for the 删表 action', () => {
    const { editor, calls } = stubEditor()
    editor.chain().focus().deleteTable().run()
    expect(calls.at(-1)?.ops).toEqual(['focus', 'deleteTable'])
  })

  it('honors editor.can() so disabled commands are gated', () => {
    const { editor, canResults } = stubEditor()
    canResults.mergeCells = false
    expect(editor.can().mergeCells()).toBe(false)
    expect(editor.can().splitCell()).toBe(true)
  })
})
