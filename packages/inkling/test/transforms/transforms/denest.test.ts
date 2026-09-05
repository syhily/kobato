import type { LexicalEditor } from 'lexical'

import { $createListItemNode, $createListNode, ListItemNode, ListNode } from '@lexical/list'
import { $createHeadingNode, HeadingNode } from '@lexical/rich-text'
import { $createParagraphNode, $createTextNode, $getRoot, ParagraphNode, TextNode } from 'lexical'

import { assertTransform, createEditor } from '#/transforms/utils'
import { ExtendedHeadingNode, BaseImageNode } from '@/nodes/base'
import { registerDefaultTransforms, registerDenestTransform } from '@/transforms/index'

describe('Denest transform', function () {
  it('handles images inside paragraphs', function () {
    const registerTransforms = (editor: LexicalEditor) => {
      registerDenestTransform(editor, ParagraphNode, () => $createParagraphNode())
    }

    // invalid state with image inside paragraph
    const before = {
      root: {
        children: [
          {
            children: [
              {
                type: 'image',
                version: 1,
                src: 'blob:https://inkling.local/aafa977a-7cc3-44fc-96ca-f7befd38343a',
                width: 1240,
                height: 744,
                title: '',
                alt: '',
                caption: '',
                cardWidth: 'regular',
                href: '',
              },
            ],
            direction: null,
            format: '',
            indent: 0,
            textFormat: 0,
            textStyle: '',
            type: 'paragraph',
            version: 1,
          },
        ],
        direction: null,
        format: '',
        indent: 0,
        type: 'root',
        version: 1,
      },
    }

    // image pulled out to top-level
    const after = {
      root: {
        children: [
          {
            type: 'image',
            version: 1,
            src: 'blob:https://inkling.local/aafa977a-7cc3-44fc-96ca-f7befd38343a',
            width: 1240,
            height: 744,
            title: '',
            alt: '',
            caption: '',
            cardWidth: 'regular',
            href: '',
          },
        ],
        direction: null,
        format: '',
        indent: 0,
        type: 'root',
        version: 1,
      },
    }

    const editor = createEditor()

    assertTransform(editor, registerTransforms, before, after)
  })

  it('handles images inside lists', function () {
    const registerTransforms = (editor: LexicalEditor) => {
      registerDenestTransform(editor, ListNode, (node) => $createListNode(node.getListType(), node.getStart()))
      registerDenestTransform(editor, ListItemNode, () => $createListItemNode())
    }

    // invalid state with image inside paragraph
    const before = {
      root: {
        children: [
          {
            children: [
              {
                children: [
                  {
                    type: 'image',
                    version: 1,
                    src: 'blob:https://inkling.local/aafa977a-7cc3-44fc-96ca-f7befd38343a',
                    width: 1240,
                    height: 744,
                    title: '',
                    alt: '',
                    caption: '',
                    cardWidth: 'regular',
                    href: '',
                  },
                ],
                direction: null,
                format: '',
                indent: 0,
                type: 'listitem',
                version: 1,
                value: 1,
              },
            ],
            direction: null,
            format: '',
            indent: 0,
            type: 'list',
            version: 1,
            listType: 'bullet',
            start: 1,
            tag: 'ul',
          },
        ],
        direction: null,
        format: '',
        indent: 0,
        type: 'root',
        version: 1,
      },
    }

    // image pulled out to top-level
    const after = {
      root: {
        children: [
          {
            type: 'image',
            version: 1,
            src: 'blob:https://inkling.local/aafa977a-7cc3-44fc-96ca-f7befd38343a',
            width: 1240,
            height: 744,
            title: '',
            alt: '',
            caption: '',
            cardWidth: 'regular',
            href: '',
          },
        ],
        direction: null,
        format: '',
        indent: 0,
        type: 'root',
        version: 1,
      },
    }

    const editor = createEditor({ nodes: [ListNode, ListItemNode, BaseImageNode] })

    assertTransform(editor, registerTransforms, before, after)
  })

  it('handles images inside nested lists', function () {
    const registerTransforms = (editor: LexicalEditor) => {
      registerDenestTransform(editor, ListNode, (node) => $createListNode(node.getListType(), node.getStart()))
      registerDenestTransform(editor, ListItemNode, () => $createListItemNode())
    }

    const before = {
      root: {
        children: [
          {
            children: [
              {
                children: [
                  {
                    detail: 0,
                    format: 0,
                    mode: 'normal',
                    style: '',
                    text: 'top-level',
                    type: 'extended-text',
                    version: 1,
                  },
                ],
                direction: 'ltr',
                format: '',
                indent: 0,
                type: 'listitem',
                version: 1,
                value: 1,
              },
              {
                children: [
                  {
                    children: [
                      {
                        children: [
                          {
                            detail: 0,
                            format: 0,
                            mode: 'normal',
                            style: '',
                            text: 'nested',
                            type: 'extended-text',
                            version: 1,
                          },
                        ],
                        direction: 'ltr',
                        format: '',
                        indent: 1,
                        type: 'listitem',
                        version: 1,
                        value: 1,
                      },
                      {
                        children: [
                          {
                            type: 'image',
                            version: 1,
                            src: 'blob:https://inkling.local/aafa977a-7cc3-44fc-96ca-f7befd38343a',
                            width: 1240,
                            height: 744,
                            title: '',
                            alt: '',
                            caption: '',
                            cardWidth: 'regular',
                            href: '',
                          },
                        ],
                        direction: null,
                        format: '',
                        indent: 1,
                        type: 'listitem',
                        version: 1,
                        value: 2,
                      },
                    ],
                    direction: 'ltr',
                    format: '',
                    indent: 0,
                    type: 'list',
                    version: 1,
                    listType: 'bullet',
                    start: 1,
                    tag: 'ul',
                  },
                ],
                direction: 'ltr',
                format: '',
                indent: 0,
                type: 'listitem',
                version: 1,
                value: 2,
              },
            ],
            direction: 'ltr',
            format: '',
            indent: 0,
            type: 'list',
            version: 1,
            listType: 'bullet',
            start: 1,
            tag: 'ul',
          },
        ],
        direction: 'ltr',
        format: '',
        indent: 0,
        type: 'root',
        version: 1,
      },
    }

    const after = {
      root: {
        children: [
          {
            children: [
              {
                checked: undefined,
                children: [
                  {
                    detail: 0,
                    format: 0,
                    mode: 'normal',
                    style: '',
                    text: 'top-level',
                    type: 'extended-text',
                    version: 1,
                  },
                ],
                direction: 'ltr',
                format: '',
                indent: 0,
                type: 'listitem',
                version: 1,
                value: 1,
              },
              {
                checked: undefined,
                children: [
                  {
                    children: [
                      {
                        checked: undefined,
                        children: [
                          {
                            detail: 0,
                            format: 0,
                            mode: 'normal',
                            style: '',
                            text: 'nested',
                            type: 'extended-text',
                            version: 1,
                          },
                        ],
                        direction: 'ltr',
                        format: '',
                        indent: 1,
                        type: 'listitem',
                        version: 1,
                        value: 1,
                      },
                    ],
                    direction: 'ltr',
                    format: '',
                    indent: 0,
                    type: 'list',
                    version: 1,
                    listType: 'bullet',
                    start: 1,
                    tag: 'ul',
                  },
                ],
                direction: 'ltr',
                format: '',
                indent: 0,
                type: 'listitem',
                version: 1,
                value: 2,
              },
            ],
            direction: 'ltr',
            format: '',
            indent: 0,
            type: 'list',
            version: 1,
            listType: 'bullet',
            start: 1,
            tag: 'ul',
          },
          {
            type: 'image',
            version: 1,
            src: 'blob:https://inkling.local/aafa977a-7cc3-44fc-96ca-f7befd38343a',
            width: 1240,
            height: 744,
            title: '',
            alt: '',
            caption: '',
            cardWidth: 'regular',
            href: '',
          },
        ],
        direction: 'ltr',
        format: '',
        indent: 0,
        type: 'root',
        version: 1,
      },
    }

    const editor = createEditor()

    assertTransform(editor, registerTransforms, before, after)
  })

  it('handles images in deeply nested paragraphs', function () {
    const registerTransforms = (editor: LexicalEditor) => {
      registerDenestTransform(editor, ParagraphNode, () => $createParagraphNode())
    }

    // invalid state with image inside paragraph
    const before = {
      root: {
        children: [
          {
            children: [
              {
                children: [
                  {
                    type: 'image',
                    version: 1,
                    src: 'blob:https://inkling.local/aafa977a-7cc3-44fc-96ca-f7befd38343a',
                    width: 1240,
                    height: 744,
                    title: '',
                    alt: '',
                    caption: '',
                    cardWidth: 'regular',
                    href: '',
                  },
                ],
                direction: null,
                format: '',
                indent: 0,
                textFormat: 0,
                textStyle: '',
                type: 'paragraph',
                version: 1,
              },
            ],
            direction: null,
            format: '',
            indent: 0,
            textFormat: 0,
            textStyle: '',
            type: 'paragraph',
            version: 1,
          },
        ],
        direction: null,
        format: '',
        indent: 0,
        type: 'root',
        version: 1,
      },
    }

    // image pulled out to top-level
    const after = {
      root: {
        children: [
          {
            type: 'image',
            version: 1,
            src: 'blob:https://inkling.local/aafa977a-7cc3-44fc-96ca-f7befd38343a',
            width: 1240,
            height: 744,
            title: '',
            alt: '',
            caption: '',
            cardWidth: 'regular',
            href: '',
          },
        ],
        direction: null,
        format: '',
        indent: 0,
        type: 'root',
        version: 1,
      },
    }

    const editor = createEditor()

    assertTransform(editor, registerTransforms, before, after)
  })

  it('handles headings+text inside list items', function () {
    const registerTransforms = (editor: LexicalEditor) => {
      registerDenestTransform(editor, ParagraphNode, () => $createParagraphNode())
      registerDenestTransform(editor, HeadingNode, (node) => $createHeadingNode(node.getTag()))
      registerDenestTransform(
        editor,
        ExtendedHeadingNode,
        (node: ExtendedHeadingNode) => new ExtendedHeadingNode(node.getTag()),
      )
      registerDenestTransform(editor, ListNode, (node) => $createListNode(node.getListType(), node.getStart()))
      registerDenestTransform(editor, ListItemNode, () => $createListItemNode())
    }

    const before = {
      root: {
        children: [
          {
            children: [
              {
                children: [
                  {
                    children: [
                      {
                        type: 'extended-text',
                        text: 'Heading',
                        format: 0,
                        style: '',
                        mode: 0,
                        detail: 0,
                      },
                    ],
                    type: 'extended-heading',
                    format: 0,
                    indent: 0,
                    dir: null,
                    tag: 'h4',
                  },
                  {
                    type: 'extended-text',
                    text: 'Paragraph',
                    format: 0,
                    style: '',
                    mode: 0,
                    detail: 0,
                  },
                ],
                type: 'listitem',
                format: 0,
                indent: 0,
                dir: null,
                value: 1,
                checked: false,
              },
            ],
            type: 'list',
            format: 0,
            indent: 0,
            dir: null,
            listType: 'bullet',
            tag: 'ul',
            start: 1,
          },
        ],
        direction: null,
        format: '',
        indent: 0,
        type: 'root',
        version: 1,
      },
    }

    const after = {
      root: {
        children: [
          {
            children: [
              {
                type: 'extended-text',
                text: 'Heading',
                format: 0,
                style: '',
                mode: undefined,
                detail: 0,
                version: 1,
              },
            ],
            direction: undefined,
            format: '',
            indent: 0,
            tag: 'h4',
            type: 'extended-heading',
            version: 1,
          },
          {
            children: [
              {
                type: 'extended-text',
                text: 'Paragraph',
                format: 0,
                style: '',
                mode: undefined,
                detail: 0,
                version: 1,
              },
            ],
            direction: null,
            format: '',
            indent: 0,
            textFormat: 0,
            textStyle: '',
            type: 'paragraph',
            version: 1,
          },
        ],
        direction: null,
        format: '',
        indent: 0,
        type: 'root',
        version: 1,
      },
    }

    const editor = createEditor()

    assertTransform(editor, registerTransforms, before, after)
  })

  it('lifts a bare list item nested in a paragraph into a root list', function () {
    // pins the orphan-list-item case end to end: denest never sees this input
    // because Lexical 0.46's class-seeded ListItemNode $transform fires on the
    // parsed item first (dirty nodes run in nodeMap order, ahead of editor-
    // registered transforms) and lifts it into a fresh list at the root. The
    // collector path that $unwrapListItemForRootInsertion still owns is pinned
    // by 'handles headings+text inside list items' above.
    const before = {
      root: {
        children: [
          {
            children: [
              {
                children: [
                  {
                    detail: 0,
                    format: 0,
                    mode: 'normal',
                    style: '',
                    text: 'Hoisted',
                    type: 'extended-text',
                    version: 1,
                  },
                ],
                direction: 'ltr',
                format: '',
                indent: 0,
                type: 'listitem',
                version: 1,
                value: 1,
              },
            ],
            direction: 'ltr',
            format: '',
            indent: 0,
            textFormat: 0,
            textStyle: '',
            type: 'paragraph',
            version: 1,
          },
        ],
        direction: 'ltr',
        format: '',
        indent: 0,
        type: 'root',
        version: 1,
      },
    }

    const after = {
      root: {
        children: [
          {
            children: [
              {
                checked: undefined,
                children: [
                  {
                    detail: 0,
                    format: 0,
                    mode: 'normal',
                    style: '',
                    text: 'Hoisted',
                    type: 'extended-text',
                    version: 1,
                  },
                ],
                direction: 'ltr',
                format: '',
                indent: 0,
                type: 'listitem',
                version: 1,
                value: 1,
              },
            ],
            direction: null,
            format: '',
            indent: 0,
            type: 'list',
            version: 1,
            listType: 'bullet',
            start: 1,
            tag: 'ul',
          },
        ],
        direction: 'ltr',
        format: '',
        indent: 0,
        type: 'root',
        version: 1,
      },
    }

    const editor = createEditor()

    assertTransform(editor, registerDefaultTransforms, before, after)
  })

  it('preserves the extended-heading type without the replacement patch', function () {
    // the shipped node sets all carry extendedHeadingNodeReplacement, which
    // masks which class the denest collector fn constructs; this editor omits
    // it, so the pin fails if the fn ever downgrades back to plain HeadingNode
    const editor = createEditor({
      nodes: [ParagraphNode, TextNode, HeadingNode, ExtendedHeadingNode, ListNode, ListItemNode],
    })

    // a list nested inside a heading is invalid: the denest fires on the
    // heading and re-creates its collector through the registered fn
    editor.update(() => {
      const heading = new ExtendedHeadingNode('h4')
      heading.append($createTextNode('Heading'))
      const item = $createListItemNode()
      item.append($createTextNode('Item'))
      heading.append($createListNode('bullet').append(item))
      $getRoot().append(heading)
    })

    const registerTransforms = (editor: LexicalEditor) => {
      registerDenestTransform(
        editor,
        ExtendedHeadingNode,
        (node: ExtendedHeadingNode) => new ExtendedHeadingNode(node.getTag()),
      )
    }
    registerTransforms(editor)
    editor.update(() => {}, { discrete: true })

    editor.getEditorState().read(() => {
      const types = $getRoot()
        .getChildren()
        .map((node) => node.getType())
      expect(types).toEqual(['extended-heading', 'list'])
    })
  })

  it('keeps original node when it also contains inline elements', function () {
    const registerTransforms = (editor: LexicalEditor) => {
      registerDenestTransform(editor, ParagraphNode, () => $createParagraphNode())
    }

    // invalid state with image inside paragraph
    const before = {
      root: {
        children: [
          {
            children: [
              {
                detail: 0,
                format: 0,
                mode: 'normal',
                style: '',
                text: 'Content with ',
                type: 'extended-text',
                version: 1,
              },
              {
                children: [
                  {
                    detail: 0,
                    format: 0,
                    mode: 'normal',
                    style: '',
                    text: 'link',
                    type: 'extended-text',
                    version: 1,
                  },
                ],
                direction: 'ltr',
                format: '',
                indent: 0,
                type: 'link',
                version: 1,
                rel: 'noreferrer',
                target: null,
                title: null,
                url: 'https://inkling.local',
              },
              {
                type: 'image',
                version: 1,
                src: 'blob:https://inkling.local/aafa977a-7cc3-44fc-96ca-f7befd38343a',
                width: 1240,
                height: 744,
                title: '',
                alt: '',
                caption: '',
                cardWidth: 'regular',
                href: '',
              },
            ],
            direction: 'ltr',
            format: '',
            indent: 0,
            textFormat: 0,
            textStyle: '',
            type: 'paragraph',
            version: 1,
          },
        ],
        direction: null,
        format: '',
        indent: 0,
        type: 'root',
        version: 1,
      },
    }

    // image pulled out to top-level
    const after = {
      root: {
        children: [
          {
            children: [
              {
                detail: 0,
                format: 0,
                mode: 'normal',
                style: '',
                text: 'Content with ',
                type: 'extended-text',
                version: 1,
              },
              {
                children: [
                  {
                    detail: 0,
                    format: 0,
                    mode: 'normal',
                    style: '',
                    text: 'link',
                    type: 'extended-text',
                    version: 1,
                  },
                ],
                direction: 'ltr',
                format: '',
                indent: 0,
                type: 'link',
                version: 1,
                rel: 'noreferrer',
                target: null,
                title: null,
                url: 'https://inkling.local',
              },
            ],
            direction: null,
            format: '',
            indent: 0,
            textFormat: 0,
            textStyle: '',
            type: 'paragraph',
            version: 1,
          },
          {
            type: 'image',
            version: 1,
            src: 'blob:https://inkling.local/aafa977a-7cc3-44fc-96ca-f7befd38343a',
            width: 1240,
            height: 744,
            title: '',
            alt: '',
            caption: '',
            cardWidth: 'regular',
            href: '',
          },
        ],
        direction: null,
        format: '',
        indent: 0,
        type: 'root',
        version: 1,
      },
    }

    const editor = createEditor()

    assertTransform(editor, registerTransforms, before, after)
  })

  it('splits paragraphs if image is in middle of paragraph', function () {
    const registerTransforms = (editor: LexicalEditor) => {
      registerDenestTransform(editor, ParagraphNode, () => $createParagraphNode())
    }

    // invalid state with image inside paragraph
    const before = {
      root: {
        children: [
          {
            children: [
              {
                detail: 0,
                format: 0,
                mode: 'normal',
                style: '',
                text: 'Content before',
                type: 'extended-text',
                version: 1,
              },
              {
                type: 'image',
                version: 1,
                src: 'blob:https://inkling.local/aafa977a-7cc3-44fc-96ca-f7befd38343a',
                width: 1240,
                height: 744,
                title: '',
                alt: '',
                caption: '',
                cardWidth: 'regular',
                href: '',
              },
              {
                detail: 0,
                format: 0,
                mode: 'normal',
                style: '',
                text: 'Content after',
                type: 'extended-text',
                version: 1,
              },
            ],
            direction: 'ltr',
            format: '',
            indent: 0,
            textFormat: 0,
            textStyle: '',
            type: 'paragraph',
            version: 1,
          },
        ],
        direction: null,
        format: '',
        indent: 0,
        type: 'root',
        version: 1,
      },
    }

    // image pulled out to top-level
    const after = {
      root: {
        children: [
          {
            children: [
              {
                detail: 0,
                format: 0,
                mode: 'normal',
                style: '',
                text: 'Content before',
                type: 'extended-text',
                version: 1,
              },
            ],
            direction: null,
            format: '',
            indent: 0,
            textFormat: 0,
            textStyle: '',
            type: 'paragraph',
            version: 1,
          },
          {
            type: 'image',
            version: 1,
            src: 'blob:https://inkling.local/aafa977a-7cc3-44fc-96ca-f7befd38343a',
            width: 1240,
            height: 744,
            title: '',
            alt: '',
            caption: '',
            cardWidth: 'regular',
            href: '',
          },
          {
            children: [
              {
                detail: 0,
                format: 0,
                mode: 'normal',
                style: '',
                text: 'Content after',
                type: 'extended-text',
                version: 1,
              },
            ],
            direction: null,
            format: '',
            indent: 0,
            textFormat: 0,
            textStyle: '',
            type: 'paragraph',
            version: 1,
          },
        ],
        direction: null,
        format: '',
        indent: 0,
        type: 'root',
        version: 1,
      },
    }

    const editor = createEditor()

    assertTransform(editor, registerTransforms, before, after)
  })

  it("doesn't error when targetted node isn't loaded in editor", function () {
    const registerTransforms = (editor: LexicalEditor) => {
      registerDenestTransform(editor, HeadingNode, (node: HeadingNode) => $createHeadingNode(node.getTag()))
    }

    const unchangedState = {
      root: {
        children: [
          {
            children: [
              {
                detail: 0,
                format: 0,
                mode: 'normal',
                style: '',
                text: 'Testing',
                type: 'text',
                version: 1,
              },
            ],
            direction: null,
            format: '',
            indent: 0,
            textFormat: 0,
            textStyle: '',
            type: 'paragraph',
            version: 1,
          },
        ],
        direction: null,
        format: '',
        indent: 0,
        type: 'root',
        version: 1,
      },
    }

    const editor = createEditor({ nodes: [ParagraphNode, TextNode] })

    assertTransform(editor, registerTransforms, unchangedState, unchangedState)
  })

  it('handles lists inside headings', function () {
    const registerTransforms = (editor: LexicalEditor) => {
      registerDenestTransform(editor, ParagraphNode, () => $createParagraphNode())
      registerDenestTransform(editor, HeadingNode, (node) => $createHeadingNode(node.getTag()))
      registerDenestTransform(
        editor,
        ExtendedHeadingNode,
        (node: ExtendedHeadingNode) => new ExtendedHeadingNode(node.getTag()),
      )
      registerDenestTransform(editor, ListNode, (node) => $createListNode(node.getListType(), node.getStart()))
      registerDenestTransform(editor, ListItemNode, () => $createListItemNode())
    }

    const before = {
      root: {
        children: [
          {
            children: [
              {
                children: [
                  {
                    children: [
                      {
                        detail: 0,
                        format: 0,
                        mode: 'normal',
                        style: '',
                        text: 'This should be plain text',
                        type: 'extended-text',
                        version: 1,
                      },
                    ],
                    direction: 'ltr',
                    format: '',
                    indent: 0,
                    type: 'listitem',
                    version: 1,
                    value: 1,
                  },
                ],
                direction: 'ltr',
                format: '',
                indent: 0,
                type: 'list',
                version: 1,
                listType: 'number',
                start: 1,
                tag: 'ol',
              },
            ],
            direction: 'ltr',
            format: '',
            indent: 0,
            type: 'heading',
            version: 1,
            tag: 'h3',
          },
        ],
        direction: null,
        format: '',
        indent: 0,
        type: 'root',
        version: 1,
      },
    }

    const after = {
      root: {
        children: [
          {
            children: [
              {
                children: [
                  {
                    detail: 0,
                    format: 0,
                    mode: 'normal',
                    style: '',
                    text: 'This should be plain text',
                    type: 'extended-text',
                    version: 1,
                  },
                ],
                checked: undefined,
                direction: 'ltr',
                format: '',
                indent: 0,
                type: 'listitem',
                version: 1,
                value: 1,
              },
            ],
            direction: 'ltr',
            format: '',
            indent: 0,
            type: 'list',
            version: 1,
            listType: 'number',
            start: 1,
            tag: 'ol',
          },
        ],
        direction: null,
        format: '',
        indent: 0,
        type: 'root',
        version: 1,
      },
    }

    const editor = createEditor()

    assertTransform(editor, registerTransforms, before, after)
  })
})
