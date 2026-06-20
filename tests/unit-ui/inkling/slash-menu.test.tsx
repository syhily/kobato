// Regression tests for InklingSlashMenuPlugin — the `/`-triggered card menu.
//
// SlashMenu detects `/` via registerUpdateListener, which reads Lexical's
// selection model ($getSelection, $isRangeSelection) to locate the trigger.
// happy-dom cannot drive Lexical's RangeSelection correctly (paragraph.select
// doesn't produce a committed RangeSelection that $getSelection returns), so
// full `/`-trigger-to-menu-open simulation is unreliable in this environment.
//
// What we CAN test reliably:
//   1. The plugin mounts without throwing inside a LexicalComposer.
//   2. The menu is initially absent (no `/` typed).
//
// The filtering, IME guard, keyboard navigation, and full trigger flow are
// verified in browser-based manual testing — the selection-model dependency
// makes them untestable in happy-dom without a jsdom + real DOM harness.

import type { LexicalEditor } from 'lexical'

import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { InklingSlashMenuPlugin } from '@/ui/inkling/editor/menu/SlashMenu'
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
        namespace: 'slash-menu-test',
        theme: {},
        nodes: ARTICLE_NODES,
        onError: (e: Error) => {
          throw e
        },
      }}
    >
      <ContentEditable />
      <EditorCapture holder={holder} />
      <InklingSlashMenuPlugin mode="article" />
    </LexicalComposer>,
  )
  return holder
}

describe('InklingSlashMenuPlugin', () => {
  it('mounts without throwing', () => {
    expect(() => mountEditor()).not.toThrow()
  })

  it('does not show the menu initially (no / typed)', () => {
    mountEditor()
    expect(document.querySelector('.inkling-slash-menu')).toBeNull()
  })

  // The filtering, keyboard navigation, mouse insert, and close-behaviour
  // tests require Lexical's RangeSelection to work in the test DOM.
  // happy-dom's selection model doesn't satisfy this — paragraph.select()
  // doesn't produce a selection that $getSelection() returns inside a
  // registerUpdateListener callback. These paths are covered by manual
  // browser testing and the headless-editor tests in tests/unit/ui/inkling/.
  it.skip('shows the menu when / is typed (requires real DOM selection)', () => {})
})
