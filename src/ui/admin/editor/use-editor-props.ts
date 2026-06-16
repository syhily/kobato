import type { EditorView } from '@tiptap/pm/view'

import { type Editor, type EditorOptions } from '@tiptap/react'
import { useMemo, useRef } from 'react'

export function useMathInlineClickEditorRef() {
  return useRef<Editor | null>(null)
}

export function useOpenFootnoteEditDialogRef() {
  return useRef<(targetKey: string) => void>(() => {
    /* noop */
  })
}

/**
 * Build the `editorProps.handleClick` callback that wires inline
 * math and footnote-ref clicks to their respective editing surfaces.
 * The refs are populated by the caller after `useEditor` resolves.
 */
export function useTiptapEditorProps(
  mathInlineClickEditorRef: React.RefObject<Editor | null>,
  openFootnoteEditDialogRef: React.RefObject<(targetKey: string) => void>,
): NonNullable<EditorOptions['editorProps']> {
  return useMemo(
    () => ({
      handleClick(view: EditorView, pos: number, event: MouseEvent): boolean {
        if (!view.editable) {
          return false
        }
        if (!(event.target instanceof Element)) {
          return false
        }
        const ed = mathInlineClickEditorRef.current
        if (ed === null) {
          return false
        }

        if (event.target.closest('[data-math-inline]')) {
          const coords = view.posAtCoords({ left: event.clientX, top: event.clientY })
          const base = coords?.pos ?? pos
          const docSize = view.state.doc.content.size
          for (const anchor of [base, base - 1, base + 1]) {
            if (anchor < 0 || anchor > docSize) {
              continue
            }
            ed.chain().focus().setTextSelection({ from: anchor, to: anchor }).extendMarkRange('mathInline').run()
            const { from, to } = ed.state.selection
            if (ed.isActive('mathInline') && from < to) {
              return true
            }
          }
          return false
        }

        if (event.target.closest('[data-footnote-ref], sup.footnote-ref')) {
          const coords = view.posAtCoords({ left: event.clientX, top: event.clientY })
          const base = coords?.pos ?? pos
          const docSize = view.state.doc.content.size
          for (const anchor of [base, base - 1, base + 1]) {
            if (anchor < 0 || anchor > docSize) {
              continue
            }
            ed.chain().focus().setTextSelection({ from: anchor, to: anchor }).extendMarkRange('footnoteRef').run()
            const { from, to } = ed.state.selection
            if (ed.isActive('footnoteRef') && from < to) {
              const attrs = ed.getAttributes('footnoteRef') as { targetKey?: string }
              const tk = attrs.targetKey ?? ''
              if (tk !== '') {
                openFootnoteEditDialogRef.current(tk)
                return true
              }
            }
          }
          return false
        }

        return false
      },
    }),
    [mathInlineClickEditorRef, openFootnoteEditDialogRef],
  )
}
