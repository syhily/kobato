import type { LexicalEditor } from 'lexical'

import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { render } from '@testing-library/react'
import { BLUR_COMMAND, FOCUS_COMMAND } from 'lexical'
import { describe, expect, it, vi } from 'vitest'

import { InklingBlurPlugin } from '@/plugins/InklingBlurPlugin'
import { InklingFocusPlugin } from '@/plugins/InklingFocusPlugin'

function Harness({ children }: { children: React.ReactNode }) {
  return (
    <LexicalComposer
      initialConfig={{
        namespace: 'test',
        nodes: [],
        onError: (error) => {
          throw error
        },
        theme: {},
      }}
    >
      {children}
    </LexicalComposer>
  )
}

function EditorProbe({ onEditor }: { onEditor: (editor: LexicalEditor) => void }) {
  const [editor] = useLexicalComposerContext()
  onEditor(editor)
  return null
}

describe('InklingBlurPlugin / InklingFocusPlugin', () => {
  it('fires onBlur while mounted and stops after unmount', () => {
    let editor: LexicalEditor
    const onBlur = vi.fn()

    const { unmount } = render(
      <Harness>
        <EditorProbe
          onEditor={(e) => {
            editor = e
          }}
        />
        <InklingBlurPlugin onBlur={onBlur} />
      </Harness>,
    )

    editor!.dispatchCommand(BLUR_COMMAND, new FocusEvent('blur'))
    expect(onBlur).toHaveBeenCalledTimes(1)

    unmount()

    editor!.dispatchCommand(BLUR_COMMAND, new FocusEvent('blur'))
    expect(onBlur).toHaveBeenCalledTimes(1)
  })

  it('fires onFocus while mounted and stops after unmount', () => {
    let editor: LexicalEditor
    const onFocus = vi.fn()

    const { unmount } = render(
      <Harness>
        <EditorProbe
          onEditor={(e) => {
            editor = e
          }}
        />
        <InklingFocusPlugin onFocus={onFocus} />
      </Harness>,
    )

    editor!.dispatchCommand(FOCUS_COMMAND, new FocusEvent('focus'))
    expect(onFocus).toHaveBeenCalledTimes(1)

    unmount()

    editor!.dispatchCommand(FOCUS_COMMAND, new FocusEvent('focus'))
    expect(onFocus).toHaveBeenCalledTimes(1)
  })
})
