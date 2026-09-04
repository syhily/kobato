/**
 * The autolink semantics pinned as a synchronous test table: the matcher
 * policy (scheme/www/bare-domain/email, tiptap `defaultProtocol`, trailing
 * punctuation) plus the upstream `registerAutoLink` machinery the plugin
 * mounts — creation on typing, reversion on edit, and the boundaries the
 * widened separator set admits.
 */
import type { ElementNode, LexicalEditor } from 'lexical'

import { $createLinkNode, $isAutoLinkNode, $isLinkNode, AutoLinkNode, LinkNode, registerAutoLink } from '@lexical/link'
import { $createParagraphNode, $createTextNode, $getRoot, $isTextNode, createEditor } from 'lexical'
import { beforeEach, describe, expect, it } from 'vitest'

import { updateEditor } from '#/utils/test-editor'
import {
  AUTOLINK_SEPARATOR,
  autolinkUrl,
  INKLING_AUTOLINK_MATCHERS,
  stripUrlTrailingPunctuation,
} from '@/plugins/behaviour/autolink'

const match = (text: string) => INKLING_AUTOLINK_MATCHERS[0](text)

describe('autolink matcher policy', () => {
  it('links scheme URLs verbatim', () => {
    expect(match('see https://example.com/a?b=c#d next')).toEqual({
      index: 4,
      length: 27,
      text: 'https://example.com/a?b=c#d',
      url: 'https://example.com/a?b=c#d',
    })
    expect(autolinkUrl('ftps://example.com')).toBe('ftps://example.com')
  })

  it('links www. URLs and bare domains with tiptap defaultProtocol (http)', () => {
    expect(match('www.example.com')).toEqual({
      index: 0,
      length: 15,
      text: 'www.example.com',
      url: 'http://www.example.com',
    })
    expect(match('go to example.com now')).toEqual({
      index: 6,
      length: 11,
      text: 'example.com',
      url: 'http://example.com',
    })
    expect(autolinkUrl('example.com/path?q=1')).toBe('http://example.com/path?q=1')
  })

  it('links emails as mailto:', () => {
    expect(match('mail me at user.name+tag@example.co.uk!')).toEqual({
      index: 11,
      length: 27,
      text: 'user.name+tag@example.co.uk',
      url: 'mailto:user.name+tag@example.co.uk',
    })
  })

  it('rejects IPv4 literals and dotless hosts (tiptap shouldAutoLink parity)', () => {
    expect(match('192.168.0.1')).toBeNull()
    expect(match('localhost:3000')).toBeNull()
    // a scheme URL links regardless of the host shape
    expect(match('http://localhost:3000')).not.toBeNull()
  })

  it('prefers the earliest position across alternatives, email over its inner domain', () => {
    expect(match('a@b.com https://x.com')?.text).toBe('a@b.com')
    expect(match('visit www.example.com')?.url).toBe('http://www.example.com')
  })

  it('excludes trailing sentence punctuation and unbalanced closers from the match', () => {
    expect(match('see https://example.com.')).toEqual({
      index: 4,
      length: 19,
      text: 'https://example.com',
      url: 'https://example.com',
    })
    expect(match('(https://example.com)')).toEqual({
      index: 1,
      length: 19,
      text: 'https://example.com',
      url: 'https://example.com',
    })
    expect(match('example.com!')).toEqual({ index: 0, length: 11, text: 'example.com', url: 'http://example.com' })
  })

  it('keeps balanced closers (Wikipedia-style URLs)', () => {
    expect(match('https://en.wikipedia.org/wiki/Foo_(bar)')).toEqual({
      index: 0,
      length: 39,
      text: 'https://en.wikipedia.org/wiki/Foo_(bar)',
      url: 'https://en.wikipedia.org/wiki/Foo_(bar)',
    })
  })

  it('strips repeatedly until the text is stable', () => {
    expect(stripUrlTrailingPunctuation('https://x.com/a).')).toBe('https://x.com/a')
    expect(stripUrlTrailingPunctuation('example.com...')).toBe('example.com')
  })
})

describe('registerAutoLink with the inkling matchers', () => {
  let editor: LexicalEditor

  beforeEach(() => {
    editor = createEditor({
      namespace: 'test',
      nodes: [LinkNode, AutoLinkNode],
      onError: (error) => {
        throw error
      },
    })
    registerAutoLink(editor, {
      changeHandlers: [],
      excludeParents: [],
      matchers: INKLING_AUTOLINK_MATCHERS,
      separatorRegex: AUTOLINK_SEPARATOR,
    })
  })

  // Node accessors only run inside a read — extract plain descriptors.
  function paragraphShape(): { type: string; url?: string; text: string }[] {
    return editor.getEditorState().read(() => {
      const paragraph = $getRoot().getFirstChild()
      if (paragraph === null || !('getChildren' in paragraph)) {
        return []
      }
      return (paragraph as ElementNode).getChildren().map((node) => ({
        type: node.getType(),
        url: $isLinkNode(node) ? node.getURL() : undefined,
        text: node.getTextContent(),
      }))
    })
  }

  it('converts a typed URL into an AutoLinkNode, leaving the prose around it as text', async () => {
    await updateEditor(editor, () => {
      const paragraph = $createParagraphNode()
      paragraph.append($createTextNode('see https://example.com now'))
      $getRoot().append(paragraph)
    })

    expect(paragraphShape()).toEqual([
      { type: 'text', url: undefined, text: 'see ' },
      { type: 'autolink', url: 'https://example.com', text: 'https://example.com' },
      { type: 'text', url: undefined, text: ' now' },
    ])
  })

  it('converts a URL hugged by brackets or exclamation (the widened separator set)', async () => {
    await updateEditor(editor, () => {
      const paragraph = $createParagraphNode()
      paragraph.append($createTextNode('(check https://example.com!)'))
      $getRoot().append(paragraph)
    })

    expect(paragraphShape().filter((child) => child.type === 'autolink')).toEqual([
      { type: 'autolink', url: 'https://example.com', text: 'https://example.com' },
    ])
  })

  it('does not re-link the text inside an existing LinkNode (markdown [t](u) path)', async () => {
    await updateEditor(editor, () => {
      const paragraph = $createParagraphNode()
      const link = $createLinkNode('https://destination.example')
      link.append($createTextNode('example.com'))
      paragraph.append(link)
      $getRoot().append(paragraph)
    })

    expect(paragraphShape()).toEqual([{ type: 'link', url: 'https://destination.example', text: 'example.com' }])
  })

  it('reverts an AutoLinkNode to plain text when the edit breaks the match', async () => {
    await updateEditor(editor, () => {
      const paragraph = $createParagraphNode()
      paragraph.append($createTextNode('https://example.com'))
      $getRoot().append(paragraph)
    })
    expect(paragraphShape().some((child) => child.type === 'autolink')).toBe(true)

    await updateEditor(editor, () => {
      const paragraph = $getRoot().getFirstChild() as ElementNode
      const link = paragraph.getChildren()[0]
      const linkText = $isAutoLinkNode(link) ? link.getFirstChild() : null
      if ($isTextNode(linkText)) {
        linkText.setTextContent('not a url')
      }
    })

    expect(paragraphShape()).toEqual([{ type: 'text', url: undefined, text: 'not a url' }])
  })
})
