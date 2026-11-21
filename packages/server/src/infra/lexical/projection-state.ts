import type { LexicalEditorState, LexicalNodeJson } from '@kobato/inkling/headless/schema'

import { MUSIC_PLAYER_PROJECTION_PLACEHOLDER } from '@kobato/inkling/headless/cards/music-player'
import { KOBATO_HOST_CARD_NODE_TYPES } from '@kobato/inkling/headless/node-whitelist'
import { unsafeCast } from '@kobato/utils/unsafe-cast'

export interface ProjectionStateOptions {
  feed: boolean
  renderableHostCardTypes?: ReadonlySet<string>
}

type MutableNode = Record<string, unknown> & { type: string; children?: LexicalNodeJson[] }

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
