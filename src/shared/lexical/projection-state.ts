// Save-time projection input shaping: the headless inkling renderer
// (`lexicalStateToHtml` / `lexicalStateToPlainText`) parses the serialized
// state into a real editor, so this module produces the state copies that parse
// yields the wanted output from. Two concerns:
//
// 1. Feed downgrade (`feed: true`) is a state transform, not HTML
//    post-processing — inkling's exportPolicy key set is closed. Stripping the
//    server-prerendered artifacts makes `math` / `math-inline` / `codeblock`
//    export escaped-tex `<pre><code>` / `<code>` without the Shiki embed; the
//    host-card feed shapes are NOT transforms — the card renderers produce them
//    from the `FEED_VARIANT_META_KIND` render-meta flag.
//
// 2. Host-card survival (defensive). `renderableHostCardTypes` normally covers
//    every type; the substitution stays armed because an unregistered type
//    aborts `parseEditorState` at first encounter and every block AFTER the
//    card vanishes from the projection (Lexical error #17). Unregistered
//    `music-player` becomes a text paragraph with its save-time meta snapshot
//    (or the placeholder), `solution` / `two-column` are dropped.

import type { LexicalEditorState, LexicalNodeJson } from '@/shared/lexical/schema'

import { KOBATO_HOST_CARD_NODE_TYPES } from '@/shared/lexical/node-whitelist'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

/** Music-player fallback copy, used when the save-time meta snapshot is absent. */
export const MUSIC_PLAYER_PROJECTION_PLACEHOLDER = '🎵 此文章包含音乐播放器，请访问原文收听。'

export interface ProjectionStateOptions {
  /** Strip the server-prerendered artifact slots (feed variant). */
  feed: boolean
  /** Host card types the renderer has real node classes for; they pass through. */
  renderableHostCardTypes?: ReadonlySet<string>
}

type MutableNode = Record<string, unknown> & { type: string; children?: LexicalNodeJson[] }

/**
 * Returns a deep-copied state shaped for the projection renderer. The input
 * is never mutated (the save pipeline persists the canonical state itself).
 */
export function toProjectionState(state: LexicalEditorState, options: ProjectionStateOptions): LexicalEditorState {
  const copy = structuredClone(state)
  rewriteChildren(unsafeCast<MutableNode>(copy.root), options)
  return copy
}

function rewriteChildren(node: MutableNode, options: ProjectionStateOptions): void {
  if (node.children === undefined) {
    return
  }
  const next: LexicalNodeJson[] = []
  for (const child of node.children) {
    const substituted = substituteHostCard(unsafeCast<MutableNode>(child), options)
    if (substituted === null) {
      continue
    }
    rewriteChildren(substituted, options)
    if (options.feed) {
      stripArtifacts(substituted)
    }
    next.push(unsafeCast<LexicalNodeJson>(substituted))
  }
  node.children = next
}

function substituteHostCard(node: MutableNode, options: ProjectionStateOptions): MutableNode | null {
  if (!(KOBATO_HOST_CARD_NODE_TYPES as readonly string[]).includes(node.type)) {
    return node
  }
  if (options.renderableHostCardTypes?.has(node.type) === true) {
    return node
  }
  if (node.type === 'music-player') {
    const name = typeof node.name === 'string' ? node.name : ''
    const artist = typeof node.artist === 'string' ? node.artist : ''
    const label = name !== '' ? `🎵 ${name}${artist !== '' ? ` — ${artist}` : ''}` : MUSIC_PLAYER_PROJECTION_PLACEHOLDER
    return {
      type: 'paragraph',
      version: 1,
      direction: 'ltr',
      format: '',
      indent: 0,
      children: [
        unsafeCast<LexicalNodeJson>({
          type: 'extended-text',
          version: 1,
          detail: 0,
          format: 0,
          mode: 'normal',
          style: '',
          text: label,
        }),
      ],
    }
  }
  // solution / two-column carry their content in nested-editor HTML strings
  // with no text fallback — an unregistered one is dropped.
  return null
}

function stripArtifacts(node: MutableNode): void {
  if (node.type === 'math' || node.type === 'math-inline') {
    node.mathml = ''
    node.svg = ''
    return
  }
  if (node.type === 'codeblock') {
    node.highlightedHtml = ''
  }
}
