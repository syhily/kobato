import { registerDefaultTransforms } from '@kobato/inkling-internal/transforms/index'
import { assertTransform, createEditor } from '@kobato/inkling/tests/unit/transforms/test-helpers'
import { describe, it } from 'vitest'

describe('Default transforms', function () {
  it('registerDefaultTransforms() registers all transforms', function () {
    const editor = createEditor()

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
                text: 'Normal',
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
                    text: 'Nested',
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
            direction: 'ltr',
            format: '',
            indent: 0,
            textFormat: 0,
            textStyle: '',
            type: 'paragraph',
            version: 1,
          },

          {
            children: [
              {
                children: [
                  {
                    detail: 0,
                    format: 0,
                    mode: 'normal',
                    style: '',
                    text: 'one',
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
            listType: 'bullet',
            start: 1,
            tag: 'ul',
          },
          {
            children: [
              {
                children: [
                  {
                    detail: 0,
                    format: 0,
                    mode: 'normal',
                    style: '',
                    text: 'two',
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
            listType: 'bullet',
            start: 1,
            tag: 'ul',
          },

          {
            children: [
              {
                detail: 0,
                format: 0,
                mode: 'normal',
                style: '',
                text: 'Aligned header',
                type: 'extended-text',
                version: 1,
              },
            ],
            direction: 'ltr',
            format: 'center',
            indent: 0,
            type: 'heading',
            version: 1,
            tag: 'h1',
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
                detail: 0,
                format: 0,
                mode: 'normal',
                style: '',
                text: 'Normal',
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
            children: [
              {
                detail: 0,
                format: 0,
                mode: 'normal',
                style: '',
                text: 'Nested',
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
                    text: 'one',
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
                    detail: 0,
                    format: 0,
                    mode: 'normal',
                    style: '',
                    text: 'two',
                    type: 'extended-text',
                    version: 1,
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
            children: [
              {
                detail: 0,
                format: 0,
                mode: 'normal',
                style: '',
                text: 'Aligned header',
                type: 'extended-text',
                version: 1,
              },
            ],
            direction: 'ltr',
            format: '',
            indent: 0,
            type: 'extended-heading',
            version: 1,
            tag: 'h1',
          },
        ],
        direction: 'ltr',
        format: '',
        indent: 0,
        type: 'root',
        version: 1,
      },
    }

    assertTransform(editor, registerDefaultTransforms, before, after)
  })

  const alignedBefore = {
    root: {
      children: [
        {
          children: [
            {
              detail: 0,
              format: 0,
              mode: 'normal',
              style: '',
              text: 'Aligned header',
              type: 'extended-text',
              version: 1,
            },
          ],
          direction: 'ltr',
          format: 'center',
          indent: 0,
          type: 'heading',
          version: 1,
          tag: 'h1',
        },
        {
          children: [
            {
              detail: 0,
              format: 0,
              mode: 'normal',
              style: '',
              text: 'Aligned paragraph',
              type: 'extended-text',
              version: 1,
            },
          ],
          direction: 'ltr',
          format: 'right',
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

  it('registerDefaultTransforms({ alignment: "strip" }) resets imported formats, like the default', function () {
    const editor = createEditor()

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
                text: 'Aligned header',
                type: 'extended-text',
                version: 1,
              },
            ],
            direction: 'ltr',
            format: '',
            indent: 0,
            type: 'extended-heading',
            version: 1,
            tag: 'h1',
          },
          {
            children: [
              {
                detail: 0,
                format: 0,
                mode: 'normal',
                style: '',
                text: 'Aligned paragraph',
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
        direction: 'ltr',
        format: '',
        indent: 0,
        type: 'root',
        version: 1,
      },
    }

    assertTransform(editor, (e) => registerDefaultTransforms(e, { alignment: 'strip' }), alignedBefore, after)
  })

  it('registerDefaultTransforms({ alignment: "keep" }) preserves imported formats', function () {
    const editor = createEditor()

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
                text: 'Aligned header',
                type: 'extended-text',
                version: 1,
              },
            ],
            direction: 'ltr',
            format: 'center',
            indent: 0,
            type: 'extended-heading',
            version: 1,
            tag: 'h1',
          },
          {
            children: [
              {
                detail: 0,
                format: 0,
                mode: 'normal',
                style: '',
                text: 'Aligned paragraph',
                type: 'extended-text',
                version: 1,
              },
            ],
            direction: 'ltr',
            format: 'right',
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

    assertTransform(editor, (e) => registerDefaultTransforms(e, { alignment: 'keep' }), alignedBefore, after)
  })
})
