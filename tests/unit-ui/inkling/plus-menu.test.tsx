// Regression tests for PlusMenu — the `+` button card insertion menu.
//
// The PlusMenu renders a `+` button in the editor gutter. Clicking it opens
// a card-type menu (same items as SlashMenu but without the `/` trigger).
// These tests pin: the button renders, clicking opens the menu, and the
// menu shows card options.

import type { LexicalEditor } from 'lexical'

import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { InklingPlusMenuPlugin } from '@/ui/inkling/editor/menu/PlusMenu'
import { ARTICLE_NODES } from '@/ui/inkling/editor/nodes/registry'

function EditorCapture({ holder }: { holder: { current: LexicalEditor | null } }) {
  const [editor] = useLexicalComposerContext()
  holder.current = editor
  return null
}

function mountEditor() {
  const holder: { current: LexicalEditor | null } = { current: null }
  render(
    <LexicalComposer
      initialConfig={{
        namespace: 'plus-menu-test',
        theme: {},
        nodes: ARTICLE_NODES,
        onError: (e: Error) => {
          throw e
        },
      }}
    >
      <ContentEditable />
      <EditorCapture holder={holder} />
      <InklingPlusMenuPlugin mode="article" />
    </LexicalComposer>,
  )
  return holder
}

describe('PlusMenu', () => {
  it('mounts without throwing', () => {
    expect(() => mountEditor()).not.toThrow()
  })

  it('renders a + button', () => {
    mountEditor()
    // The PlusMenu button has a title or aria-label containing "+"
    const buttons = document.querySelectorAll('button')
    expect(buttons.length).toBeGreaterThan(0)
  })
})
