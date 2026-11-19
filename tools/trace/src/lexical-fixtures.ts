import type { LexicalEditorState } from '@kobato/lexical/schema.ts'

import { unsafeCast } from '@kobato/utils/unsafe-cast.ts'

function element(type: string, children: unknown[] = [], extra: Record<string, unknown> = {}) {
  return { type, version: 1, children, direction: 'ltr', format: '', indent: 0, ...extra }
}

function text(value: string, extra: Record<string, unknown> = {}) {
  return { type: 'extended-text', version: 1, detail: 0, format: 0, mode: 'normal', style: '', text: value, ...extra }
}

export function emptyLexicalBody(): LexicalEditorState {
  return unsafeCast<LexicalEditorState>({ root: element('root', []) })
}

export function lexicalBodyWith(children: unknown[]): LexicalEditorState {
  return unsafeCast<LexicalEditorState>({ root: element('root', children) })
}

export function lexicalParagraph(value: string) {
  return element('paragraph', [text(value)], { textFormat: 0, textStyle: '' })
}

export function lexicalHeading(tag: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6', value: string) {
  return element('extended-heading', [text(value)], { tag })
}

export function lexicalImage(overrides: Record<string, unknown> = {}) {
  const node: Record<string, unknown> = {
    type: 'image',
    version: 1,
    src: '/storage/posts/cover.png',
    caption: '',
    title: '',
    alt: 'cover',
    cardWidth: 'regular',
    width: 800,
    height: 600,
    href: '',
    ...overrides,
  }
  return node
}

export function lexicalMusicPlayer(playerId: string, extra: Record<string, unknown> = {}) {
  return { type: 'music-player', version: 1, playerId, ...extra }
}
