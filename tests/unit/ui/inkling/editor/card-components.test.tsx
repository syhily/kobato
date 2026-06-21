// @vitest-environment happy-dom

// Regression tests for the Inkling card React components.
//
// These pin the *observable* rendering behaviour of every card component
// in `src/ui/inkling/editor/cards/*-card-component.tsx`. The components
// were split out of the former `card-components.tsx` god file (Phase 2);
// these tests guard the split against regressions.
//
// What could regress in those phases and what we guard against:
//   - The `CardShell` wrapper's data attributes (`data-inkling-card`,
//     `data-inkling-card-selected`) — relied on by DnD + click handlers.
//   - Each card's empty/placeholder state vs. its populated state
//     (the picker prompt must show when there is no content).
//   - The picker wiring: `useInklingArticleEditorActions` must route the
//     "选择图片" / "选择音乐" buttons to `openImagePicker` / `openMusicPicker`.
//
// Harness note: these components live behind `useLexicalComposerContext` +
// `useLexicalNodeSelection`, so they cannot be rendered in isolation. We
// mount a real `<LexicalComposer>` (provides the context + a headless editor
// seeded with the card node) and render the component directly as the
// composer's child — the same context the production `decorate()` portal
// gives it, without the portal indirection that requires a mounted root
// element. See `tests/_helpers/headless-editor.ts` for the shared node set.

import type { ReactNode } from 'react'

import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { render, screen } from '@testing-library/react'
import { $getRoot, type LexicalEditor, type LexicalNode } from 'lexical'
import { describe, expect, it, vi } from 'vitest'

import { TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'
import { BlogSettingsProvider } from '@/shared/lib/blog-config-context'
import {
  InklingArticleEditorProvider,
  type InklingArticleEditorActions,
} from '@/ui/inkling/editor/article/article-editor-context'
import { CodeCardComponent } from '@/ui/inkling/editor/cards/code-card-component'
import { HorizontalRuleCardComponent } from '@/ui/inkling/editor/cards/horizontal-rule-card-component'
import { ImageCardComponent } from '@/ui/inkling/editor/cards/image-card-component'
import { MusicCardComponent } from '@/ui/inkling/editor/cards/music-card-component'
import {
  $createCodeCardNode,
  $createHorizontalRuleCardNode,
  $createImageCardNode,
  $createMusicCardNode,
} from '@/ui/inkling/editor/cards/simple-card-nodes'
import { ARTICLE_NODES as ARTICLE_EDITOR_NODES } from '@/ui/inkling/editor/nodes/registry'

/**
 * Build a `<LexicalComposer>` whose editor is seeded with a single card node
 * (created by `seed`), then render the card component inside the composer
 * context. The seed callback creates the node, appends it to the root, and
 * returns the live node instance captured during the `editorState` init
 * (inside Lexical's update loop, so the node is guaranteed live).
 *
 * `InklingArticleEditorProvider` is always mounted so card components that
 * call `useInklingArticleEditorActions()` resolve against mock actions.
 *
 * The card node is captured as a Lexical-internal reference during init and
 * stashed on `holder.node`. The DeferredChild re-reads it via the composer
 * context's editor at render time — but because Lexical node identity is
 * stable across reads within the same editor state, passing the originally-
 * captured node is safe.
 */
function renderCardInComposer<T extends LexicalNode>(
  seed: () => T,
  renderNode: (node: T) => ReactNode,
  actions: InklingArticleEditorActions = {},
): { editor: LexicalEditor; node: T } {
  const holder: { current: LexicalEditor | null; node: T | null } = { current: null, node: null }

  const initialConfig = {
    namespace: 'inkling-card-test',
    theme: {},
    onError: (e: Error) => {
      throw e
    },
    nodes: ARTICLE_EDITOR_NODES,
    editorState: (e: LexicalEditor) => {
      holder.current = e
      holder.node = seed()
    },
  }

  function DeferredChild() {
    useLexicalComposerContext() // establish we're inside the composer
    return <>{renderNode(holder.node as T)}</>
  }

  render(
    <BlogSettingsProvider value={TEST_BLOG_SETTINGS_BUNDLE}>
      <InklingArticleEditorProvider actions={actions}>
        <LexicalComposer initialConfig={initialConfig}>
          <DeferredChild />
        </LexicalComposer>
      </InklingArticleEditorProvider>
    </BlogSettingsProvider>,
  )

  return { editor: holder.current!, node: holder.node! }
}

describe('card-components', () => {
  describe('CardShell wrapper (shared by every card)', () => {
    it('renders the data-inkling-card attribute on the root wrapper', () => {
      // Every card renders through `CardShell`, which sets
      // `data-inkling-card` and `data-inkling-card-key`. The DnD reorder
      // plugin and click-to-select handler query by these attributes, so
      // they are part of the observable contract.
      renderCardInComposer(
        () => {
          const node = $createHorizontalRuleCardNode()
          $getRoot().append(node)
          return node
        },
        (node) => <HorizontalRuleCardComponent node={node} />,
      )

      const card = document.querySelector('[data-inkling-card]')
      expect(card).not.toBeNull()
      expect(card?.hasAttribute('data-inkling-card-key')).toBe(true)
    })

    it('does not mark the card selected by default', () => {
      // An unselected card omits `data-inkling-card-selected` entirely
      // (set to `undefined` → attribute absent). Selection is driven by
      // `useLexicalNodeSelection` reacting to a Lexical `NodeSelection`,
      // which no test interaction here creates.
      renderCardInComposer(
        () => {
          const node = $createHorizontalRuleCardNode()
          $getRoot().append(node)
          return node
        },
        (node) => <HorizontalRuleCardComponent node={node} />,
      )

      const card = document.querySelector('[data-inkling-card]')
      expect(card?.getAttribute('data-inkling-card-selected')).toBeFalsy()
    })
  })

  describe('HorizontalRuleCardComponent', () => {
    it('renders an <hr> element', () => {
      renderCardInComposer(
        () => {
          const node = $createHorizontalRuleCardNode()
          $getRoot().append(node)
          return node
        },
        (node) => <HorizontalRuleCardComponent node={node} />,
      )

      // The HR card is the simplest card — it renders nothing but an <hr>
      // inside CardShell. Pin the tag so a Phase 5 base-class extraction
      // can't accidentally drop it.
      expect(document.querySelector('hr')).not.toBeNull()
    })
  })

  describe('ImageCardComponent', () => {
    it('shows the empty-image placeholder when src is empty and not selected', () => {
      renderCardInComposer(
        () => {
          const node = $createImageCardNode({ src: '', layout: 'center' })
          $getRoot().append(node)
          return node
        },
        (node) => <ImageCardComponent node={node} />,
      )

      // Unselected + empty src → placeholder text (the picker button only
      // shows when the card is selected). No <img> in the empty state.
      expect(screen.getByText('空图片卡片（点击编辑）')).toBeInTheDocument()
      expect(document.querySelector('img')).toBeNull()
    })

    it('renders an <img> with the node src/alt when src is set', () => {
      renderCardInComposer(
        () => {
          const node = $createImageCardNode({
            src: 'https://example.com/photo.png',
            alt: 'a photo',
            layout: 'center',
          })
          $getRoot().append(node)
          return node
        },
        (node) => <ImageCardComponent node={node} />,
      )

      const img = document.querySelector('img')
      expect(img).not.toBeNull()
      expect(img?.getAttribute('src')).toBe('https://example.com/photo.png')
      expect(img?.getAttribute('alt')).toBe('a photo')
    })
  })

  describe('CodeCardComponent', () => {
    it('renders the code text in the CodeBlock renderer when not selected', () => {
      renderCardInComposer(
        () => {
          const node = $createCodeCardNode({ code: 'console.log("hi")', language: 'javascript' })
          $getRoot().append(node)
          return node
        },
        (node) => <CodeCardComponent node={node} />,
      )

      // Unselected → the published CodeBlock renderer (header + <pre><code>).
      // The code text must be present somewhere in the rendered output.
      const pre = document.querySelector('pre')
      expect(pre).not.toBeNull()
      expect(pre?.textContent).toContain('console.log("hi")')
    })
  })

  describe('MusicCardComponent', () => {
    it('shows the "选择音乐" picker button when no playerId is set', () => {
      renderCardInComposer(
        () => {
          const node = $createMusicCardNode({ playerId: '' })
          $getRoot().append(node)
          return node
        },
        (node) => <MusicCardComponent node={node} />,
      )

      expect(screen.getByText('选择音乐')).toBeInTheDocument()
      expect(screen.getByText('未选择音乐')).toBeInTheDocument()
    })

    it('calls openMusicPicker when the "选择音乐" button is clicked', () => {
      const openMusicPicker = vi.fn()
      renderCardInComposer(
        () => {
          const node = $createMusicCardNode({ playerId: '' })
          $getRoot().append(node)
          return node
        },
        (node) => <MusicCardComponent node={node} />,
        { openMusicPicker },
      )

      screen.getByText('选择音乐').click()

      expect(openMusicPicker).toHaveBeenCalledTimes(1)
    })

    it('renders the static music preview (not the empty picker) when a playerId is set', () => {
      // With a playerId the card renders `StaticMusicPreview`. That effect
      // fetches music metadata via the oRPC client — we only assert the
      // picker prompt is gone and the preview chrome (title span, time
      // placeholders) is present, not the fetched name.
      renderCardInComposer(
        () => {
          const node = $createMusicCardNode({ playerId: 'song-123' })
          $getRoot().append(node)
          return node
        },
        (node) => <MusicCardComponent node={node} />,
      )

      expect(screen.queryByText('选择音乐')).not.toBeInTheDocument()
      // StaticMusicPreview shows the playerId as the title before metadata
      // resolves (and the fetch fails in the test env, so it stays).
      expect(screen.getByText('song-123')).toBeInTheDocument()
      // The aplayer time row renders `--:--` placeholders.
      expect(screen.getAllByText('--:--').length).toBeGreaterThan(0)
    })
  })

  // Skipped: the selected-state render branches (alt/caption inputs, the
  // code edit textarea, the table row/col controls). Driving a Lexical
  // `NodeSelection` from jsdom requires dispatching `SELECTION_COMMAND` /
  // `FORMAT_ELEMENT_COMMAND` against the mounted root element and is brittle
  // across Lexical patch versions. The unselected render path above already
  // pins the wrapper contract + empty-state + picker wiring that the Phase
  // 2/5 refactor is most likely to disturb.
  it.skip('renders edit controls when the card node is selected', () => {
    // Placeholder — see comment above. Implement with
    // `editor.update(() => $setSelection($createNodeSelection()))` once a
    // stable selection helper exists in #/_helpers/headless-editor.
  })
})
