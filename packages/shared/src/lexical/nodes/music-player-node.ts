import type {
  DOMConversionMap,
  DOMExportOutput,
  EditorConfig,
  LexicalEditor,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from 'lexical'

import { MUSIC_MISSING_PLACEHOLDER } from '@kobato/shared/lexical/html-manifest'
import { renderNodeView } from '@kobato/shared/lexical/node-views'
import { $applyNodeReplacement, DecoratorNode } from 'lexical'

// Music player block node (PT `musicPlayer` block → `{type: 'musicPlayer',
// playerId, auto?, center?, ptKey?}`). `playerId` is the 16-char
// `[a-z0-9]` opaque handle from `music.player_id`. Serialization is the
// R1 contract; this round adds the DOM trio — the feed placeholder form
// (the renderer's missing-meta branch) round-trippable via `data-*`, and
// `decorate` (the APlayer card reusing the tiptap music block pieces,
// registered by the editor engine through the shared node-view registry —
// this node class itself carries no React import).

export type SerializedMusicPlayerNode = Spread<
  SerializedLexicalNode,
  {
    type: 'musicPlayer'
    playerId: string
    auto?: boolean
    center?: boolean
    /** Originating PT block `_key` (migration reconciliation). */
    ptKey?: string
  }
>

export class MusicPlayerNode extends DecoratorNode<unknown> {
  static getType(): string {
    return 'musicPlayer'
  }

  static clone(node: MusicPlayerNode): MusicPlayerNode {
    return new MusicPlayerNode(node.__playerId, node.__auto, node.__center, node.__ptKey, node.__key)
  }

  __playerId: string
  __auto: boolean | undefined
  __center: boolean | undefined
  __ptKey: string | undefined

  constructor(playerId: string, auto?: boolean, center?: boolean, ptKey?: string, key?: NodeKey) {
    super(key)
    this.__playerId = playerId
    this.__auto = auto
    this.__center = center
    this.__ptKey = ptKey
  }

  static importJSON(serializedNode: SerializedMusicPlayerNode): MusicPlayerNode {
    return new MusicPlayerNode(
      serializedNode.playerId,
      serializedNode.auto,
      serializedNode.center,
      serializedNode.ptKey,
    )
  }

  exportJSON(): SerializedMusicPlayerNode {
    return {
      type: 'musicPlayer',
      version: 1,
      playerId: this.__playerId,
      ...(this.__auto !== undefined ? { auto: this.__auto } : {}),
      ...(this.__center !== undefined ? { center: this.__center } : {}),
      ...(this.__ptKey !== undefined ? { ptKey: this.__ptKey } : {}),
    }
  }

  isInline(): boolean {
    return false
  }

  // --- mutation helpers (editor views) ---------------------------------------

  setPlayerId(playerId: string): void {
    this.getWritable().__playerId = playerId
  }

  setAuto(auto: boolean | undefined): void {
    this.getWritable().__auto = auto
  }

  setCenter(center: boolean | undefined): void {
    this.getWritable().__center = center
  }

  getPlayerId(): string {
    return this.__playerId
  }

  getAuto(): boolean | undefined {
    return this.__auto
  }

  getCenter(): boolean | undefined {
    return this.__center
  }

  getPtKey(): string | undefined {
    return this.__ptKey
  }

  // --- DOM trio ---------------------------------------------------------------
  //
  // `createDOM` returns the in-editor container (the React view is
  // portaled into it); the export form is built separately in
  // `exportDOM` with the feed-placeholder markup.

  createDOM(_config: EditorConfig, _editor: LexicalEditor): HTMLElement {
    return document.createElement('div')
  }

  updateDOM(_prevNode: MusicPlayerNode, _dom: HTMLElement, _config: EditorConfig): boolean {
    return false
  }

  decorate(editor: LexicalEditor): unknown {
    return renderNodeView(MusicPlayerNode, this, editor)
  }

  static importDOM(): DOMConversionMap | null {
    return {
      p: (element: HTMLElement) => {
        const playerId = element.getAttribute('data-pt-music-player')
        if (playerId === null) {
          return null
        }
        const parseFlag = (value: string | null): boolean | undefined => {
          if (value === null) {
            return undefined
          }
          return value === 'true'
        }
        const ptKey = element.getAttribute('data-pt-key') ?? undefined
        return {
          conversion: () => ({
            node: $createMusicPlayerNode(
              playerId,
              parseFlag(element.getAttribute('data-auto')),
              parseFlag(element.getAttribute('data-center')),
              ptKey,
            ),
          }),
          priority: 1,
        }
      },
    }
  }

  exportDOM(_editor: LexicalEditor): DOMExportOutput {
    // The renderer's missing-meta branch (`MUSIC_MISSING_PLACEHOLDER`) —
    // the editor has no music metadata, so export cannot produce the
    // figure form; the placeholder keeps editor and public output
    // isomorphic, and the `data-*` attributes round-trip the payload.
    const element = document.createElement('p')
    element.setAttribute('data-pt-music-player', this.__playerId)
    if (this.__auto !== undefined) {
      element.setAttribute('data-auto', String(this.__auto))
    }
    if (this.__center !== undefined) {
      element.setAttribute('data-center', String(this.__center))
    }
    if (this.__ptKey !== undefined) {
      element.setAttribute('data-pt-key', this.__ptKey)
    }
    element.textContent = MUSIC_MISSING_PLACEHOLDER
    return { element }
  }
}

export function $createMusicPlayerNode(
  playerId: string,
  auto?: boolean,
  center?: boolean,
  ptKey?: string,
): MusicPlayerNode {
  return $applyNodeReplacement(new MusicPlayerNode(playerId, auto, center, ptKey))
}

export function $isMusicPlayerNode(node: LexicalNode | null | undefined): node is MusicPlayerNode {
  return node instanceof MusicPlayerNode
}
