// Save-time projection input shaping (plan docs/plans/inkling-editor-replacement.md,
// round R9b). The headless inkling renderer (`lexicalStateToHtml` /
// `lexicalStateToPlainText`) parses the serialized state into a real editor —
// this module produces the state copies that parse yields the wanted output
// from. Two concerns:
//
// 1. **Feed downgrade** (`feed: true`). inkling's exportPolicy key set is
//    closed (`inkling-version` / `footnotes-section-title` only) — there is
//    no knob for the rssMode degradations, so the variant is expressed as a
//    state transform instead of HTML post-processing. The fallback exporters
//    then produce exactly the PT `rssMode` shapes (`pt-html.ts:150-155,
//    223-226, 256-268`): stripping the server-prerendered artifacts makes
//    `math` export `<pre><code>escaped tex</code></pre>`
//    (`math-renderer.ts`), `math-inline` `<code>escaped tex</code>`
//    (`MathInlineNode.exportDOM`), and `codeblock` a plain
//    `<pre><code class="language-*">` without the Shiki embed
//    (`codeblock-renderer.ts`). `two-column` flattening falls out of the
//    host-card substitution below until R10's real card class ships a
//    feed-aware exportDOM.
//
// 2. **Host-card survival**. `solution` / `two-column` / `music-player` have
//    no node class until R10's `defineCard` lands, and an unregistered type
//    aborts `parseEditorState` at first encounter — every block AFTER the
//    card would vanish from the projection (Lexical error #17). Substitute
//    the still-unregistered cards with serialized stand-ins so the rest of
//    the document always projects: `music-player` becomes a text paragraph
//    carrying its save-time meta snapshot (or the PT feed placeholder when
//    the snapshot is absent), `solution` / `two-column` are dropped (their
//    nested datasets are undefined until R10 — nothing honest to project).
//    R10 registers the real classes through the projection module's node
//    list; a registered type leaves this substitution path automatically via
//    `renderableHostCardTypes`.

import type { LexicalEditorState, LexicalNodeJson } from '@/shared/lexical/schema'

import { KOBATO_HOST_CARD_NODE_TYPES } from '@/shared/lexical/node-whitelist'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

/** PT `rssMode` music-player fallback copy (`pt-html.ts` renderMusicPlayer). */
export const MUSIC_PLAYER_PROJECTION_PLACEHOLDER = '🎵 此文章包含音乐播放器，请访问原文收听。'

export interface ProjectionStateOptions {
  /** Strip the server-prerendered artifact slots (feed variant). */
  feed: boolean
  /**
   * Host card types the renderer has real node classes for — those pass
   * through untouched. Empty until R10 wires the `defineCard` classes into
   * the projection module.
   */
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
  // solution / two-column: nested datasets undefined until R10 — drop.
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
